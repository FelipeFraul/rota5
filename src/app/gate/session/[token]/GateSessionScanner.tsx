"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GateSessionScannerProps = {
  token: string;
  initialValidation: GateSessionValidation;
};

type GateSessionValidation =
  | {
      valid: true;
      gateSession: {
        id: string;
        gateLabel: string | null;
        eventTitle: string | null;
        sessionStartsAt: string | null;
        validatorPhoneLast4: string;
        expiresAt: string;
        status: "active";
      };
    }
  | {
      valid: false;
      reason: string;
    };

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

const ALLOWED_SCAN_PAUSE_MS = 4_000;
const REPEATED_SCAN_COOLDOWN_MS = 3_000;
const ALLOWED_REPEAT_COOLDOWN_MS = 10_000;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", " às");
}

function describeInvalidReason(reason?: string) {
  if (reason === "expired") {
    return "Este acesso de portaria expirou.";
  }

  if (reason === "revoked") {
    return "Este acesso de portaria foi revogado.";
  }

  return "Não foi possível validar este acesso de portaria.";
}

function extractTicketToken(rawValue: string) {
  const value = rawValue.trim();

  try {
    const parsedUrl = new URL(value);
    const match = parsedUrl.pathname.match(/\/tickets\/([^/]+)\/?$/);

    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Not a URL; use the raw QR value as the ticket token.
  }

  return value;
}

export function GateSessionScanner({
  token,
  initialValidation,
}: GateSessionScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<string | null>(null);
  const lastScanAtRef = useRef(0);
  const lastAllowedTokenRef = useRef<string | null>(null);
  const lastAllowedAtRef = useRef(0);
  const scanPausedUntilRef = useRef(0);
  const scanResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingScanRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [validation, setValidation] =
    useState<GateSessionValidation>(initialValidation);
  const [loading, setLoading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Aguardando câmera...");
  const [lastResult, setLastResult] = useState("Nenhuma leitura ainda.");
  const [manualCode, setManualCode] = useState("");
  const [allowedCount, setAllowedCount] = useState(0);
  const [deniedCount, setDeniedCount] = useState(0);
  const [lastAction, setLastAction] = useState<"allowed" | "denied" | null>(null);
  const [accessOverlay, setAccessOverlay] = useState<{
    ticketCode?: string;
    sectionName?: string | null;
    seatCode?: string | null;
  } | null>(null);

  const triggerCounterFeedback = useCallback((action: "allowed" | "denied") => {
    setLastAction(action);

    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    feedbackTimerRef.current = setTimeout(() => {
      setLastAction(null);
      feedbackTimerRef.current = null;
    }, 900);
  }, []);

  const registerAllowedResult = useCallback(
    (result: {
      message?: string;
      ticket?: {
        ticketCode?: string;
        sectionName?: string | null;
        seatCode?: string | null;
      };
    }) => {
      setAllowedCount((count) => count + 1);
      triggerCounterFeedback("allowed");
      setLastResult(
        [
          result.message ?? "Entrada liberada.",
          result.ticket?.ticketCode ? `Código: ${result.ticket.ticketCode}` : null,
          result.ticket?.sectionName ? `Setor: ${result.ticket.sectionName}` : null,
          result.ticket?.seatCode ? `Assento: ${result.ticket.seatCode}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
    [triggerCounterFeedback],
  );

  const registerDeniedResult = useCallback((message: string) => {
    setDeniedCount((count) => count + 1);
    triggerCounterFeedback("denied");
    setLastResult(message);
  }, [triggerCounterFeedback]);

  const pauseScannerAfterAllowed = useCallback(
    (
      ticketToken: string,
      ticket?: {
        ticketCode?: string;
        sectionName?: string | null;
        seatCode?: string | null;
      },
    ) => {
      lastAllowedTokenRef.current = ticketToken;
      lastAllowedAtRef.current = Date.now();
      scanPausedUntilRef.current = Date.now() + ALLOWED_SCAN_PAUSE_MS;
      setAccessOverlay(ticket ?? {});
      setCameraStatus("Acesso liberado. Scanner pausado temporariamente.");

      if (scanResumeTimerRef.current) {
        clearTimeout(scanResumeTimerRef.current);
      }

      scanResumeTimerRef.current = setTimeout(() => {
        setAccessOverlay(null);
        scanPausedUntilRef.current = 0;
        setCameraStatus("Scanner ativo. Aponte para o QR Code do ingresso.");
        scanResumeTimerRef.current = null;
      }, ALLOWED_SCAN_PAUSE_MS);
    },
    [],
  );

  const submitScan = useCallback(
    async (rawTicketToken: string) => {
      const ticketToken = extractTicketToken(rawTicketToken);
      const now = Date.now();

      if (!ticketToken) {
        return;
      }

      if (now < scanPausedUntilRef.current) {
        return;
      }

      if (
        ticketToken === lastAllowedTokenRef.current &&
        now - lastAllowedAtRef.current < ALLOWED_REPEAT_COOLDOWN_MS
      ) {
        return;
      }

      if (
        ticketToken === lastScanRef.current &&
        now - lastScanAtRef.current < REPEATED_SCAN_COOLDOWN_MS
      ) {
        return;
      }

      if (submittingScanRef.current) {
        return;
      }

      submittingScanRef.current = true;
      lastScanRef.current = ticketToken;
      lastScanAtRef.current = now;

      try {
        const response = await fetch("/api/gate/session/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gateSessionToken: token,
            ticketToken,
          }),
        });
        const result = (await response.json()) as {
          allowed?: boolean;
          message?: string;
          result?: string;
          ticket?: {
            ticketCode?: string;
            sectionName?: string | null;
            seatCode?: string | null;
          };
        };

        if (result.allowed) {
          registerAllowedResult(result);
          pauseScannerAfterAllowed(ticketToken, result.ticket);
          return;
        }

        registerDeniedResult(result.message ?? "Entrada recusada.");
      } catch {
        registerDeniedResult("Não foi possível registrar a leitura.");
      } finally {
        submittingScanRef.current = false;
      }
    },
    [
      pauseScannerAfterAllowed,
      registerAllowedResult,
      registerDeniedResult,
      token,
    ],
  );

  useEffect(() => {
    if (!initialValidation.valid) {
      return;
    }

    let cancelled = false;

    async function validateSession() {
      try {
        const response = await fetch("/api/gate/session/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        const result = (await response.json()) as GateSessionValidation;

        if (!cancelled) {
          setValidation(result);
        }
      } catch {
        if (!cancelled) {
          setValidation({ valid: false, reason: "request_failed" });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    validateSession();

    return () => {
      cancelled = true;
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      if (scanResumeTimerRef.current) {
        clearTimeout(scanResumeTimerRef.current);
      }
    };
  }, [initialValidation.valid, token]);

  useEffect(() => {
    if (!validation?.valid) {
      return;
    }

    let cancelled = false;
    let animationFrame = 0;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("Câmera não disponível neste navegador.");
        return;
      }

      if (!window.BarcodeDetector) {
        setCameraStatus(
          "Câmera pronta, mas leitura automática de QR não é suportada neste navegador. Use o campo manual abaixo.",
        );
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
          },
          audio: false,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!window.BarcodeDetector) {
          return;
        }

        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

        const tick = async () => {
          if (cancelled || !videoRef.current) {
            return;
          }

          if (Date.now() < scanPausedUntilRef.current) {
            animationFrame = window.requestAnimationFrame(tick);
            return;
          }

          try {
            const codes = await detector.detect(videoRef.current);
            const rawValue = codes[0]?.rawValue;

            if (rawValue) {
              await submitScan(rawValue);
            }

            setCameraStatus("Scanner ativo. Aponte para o QR Code do ingresso.");
          } catch {
            setCameraStatus("Câmera ativa. Aguardando QR Code legível.");
          }

          animationFrame = window.requestAnimationFrame(tick);
        };

        animationFrame = window.requestAnimationFrame(tick);
      } catch {
        setCameraStatus("Não foi possível acessar a câmera.");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [submitScan, validation]);

  async function submitManualCode() {
    const value = manualCode.trim();

    if (!value) {
      return;
    }

    setManualCode("");
    await submitScan(value);
  }

  if (loading) {
    return (
      <main className="gate-shell">
        <h1>Portaria</h1>
        <p>Validando acesso temporário...</p>
      </main>
    );
  }

  if (!validation?.valid) {
    return (
      <main className="gate-shell">
        <h1>Acesso inválido</h1>
        <p>{describeInvalidReason(validation?.reason)}</p>
      </main>
    );
  }

  return (
    <main className="gate-shell">
      <section className="gate-header">
        <div>
          <p className="gate-kicker">Portaria</p>
          <h1>{validation.gateSession.eventTitle ?? "Evento"}</h1>
          {validation.gateSession.sessionStartsAt ? (
            <p>Sessão: {formatDateTime(validation.gateSession.sessionStartsAt)}</p>
          ) : null}
          <p>Validade: {formatDateTime(validation.gateSession.expiresAt)}</p>
          <p>Validador: final {validation.gateSession.validatorPhoneLast4}</p>
        </div>
        <span className="gate-status">Sessão ativa</span>
      </section>

      <section className="gate-counters" aria-label="Contadores de leitura">
        <div className={lastAction === "allowed" ? "is-validating" : undefined}>
          <strong>{allowedCount}</strong>
          <span>Validados</span>
        </div>
        <div className={lastAction === "denied" ? "is-denying" : undefined}>
          <strong>{deniedCount}</strong>
          <span>Recusados</span>
        </div>
      </section>

      <section className={accessOverlay ? "gate-scanner is-paused" : "gate-scanner"}>
        <video ref={videoRef} muted playsInline />
        {accessOverlay ? (
          <div className="gate-access-overlay" role="status" aria-live="assertive">
            <strong>ACESSO LIBERADO</strong>
            {accessOverlay.ticketCode ? (
              <span>Código: {accessOverlay.ticketCode}</span>
            ) : null}
            {accessOverlay.sectionName ? (
              <span>Setor: {accessOverlay.sectionName}</span>
            ) : null}
            {accessOverlay.seatCode ? (
              <span>Ingresso/Assento: {accessOverlay.seatCode}</span>
            ) : null}
          </div>
        ) : null}
        <p>{cameraStatus}</p>
      </section>

      <section className="gate-manual">
        <label htmlFor="manual-ticket-token">Leitura manual de teste</label>
        <div>
          <input
            id="manual-ticket-token"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Cole o conteúdo do QR/link"
          />
          <button type="button" onClick={submitManualCode}>
            Registrar
          </button>
        </div>
      </section>

      <section
        className={[
          "gate-result",
          lastAction === "allowed" ? "is-validating" : null,
          lastAction === "denied" ? "is-denying" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <h2>Último resultado</h2>
        <p>{lastResult}</p>
        <small>
          A validação marca o ingresso como usado uma única vez.
        </small>
      </section>
    </main>
  );
}
