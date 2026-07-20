"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QrScanner from "qr-scanner";
import BrandLogo from "@/app/BrandLogo";
import { InformationPage } from "@/app/InformationPage";

type GateSessionScannerProps = {
  initialValidation: GateSessionValidation;
};

type GateSessionValidation =
  | {
      valid: true;
      gateSession: {
        gateLabel: string | null;
        eventTitle: string | null;
        sessionStartsAt: string | null;
      };
      summary: {
        allowedCount: number;
        deniedCount: number;
        lastResult: string | null;
      };
    }
  | {
      valid: false;
      reason: string;
    };

const ALLOWED_SCAN_PAUSE_MS = 4_000;
const REPEATED_SCAN_COOLDOWN_MS = 3_000;
const ALLOWED_REPEAT_COOLDOWN_MS = 10_000;

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

function getRouteToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function GateSessionScanner({
  initialValidation,
}: GateSessionScannerProps) {
  const params = useParams<{ token?: string | string[] }>();
  const token = getRouteToken(params.token);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
  const [lastResult, setLastResult] = useState(
    initialValidation.valid
      ? initialValidation.summary.lastResult ?? "Nenhuma leitura ainda."
      : "Nenhuma leitura ainda.",
  );
  const [manualCode, setManualCode] = useState("");
  const [consultCode, setConsultCode] = useState("");
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultResult, setConsultResult] = useState<string | null>(null);
  const [consultedTicketCode, setConsultedTicketCode] = useState<string | null>(null);
  const [allowedCount, setAllowedCount] = useState(
    initialValidation.valid ? initialValidation.summary.allowedCount : 0,
  );
  const [deniedCount, setDeniedCount] = useState(
    initialValidation.valid ? initialValidation.summary.deniedCount : 0,
  );
  const [lastAction, setLastAction] = useState<"allowed" | "denied" | null>(null);
  const [scanOverlay, setScanOverlay] = useState<{
    type: "allowed" | "denied";
    message?: string;
    section?: string | null;
    seat?: string | null;
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
      section?: string | null;
      seat?: string | null;
    }) => {
      setAllowedCount((count) => count + 1);
      triggerCounterFeedback("allowed");
      setLastResult(
        [
          result.message ?? "Entrada liberada.",
          result.section ? `Setor: ${result.section}` : null,
          result.seat ? `Assento: ${result.seat}` : null,
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
        section?: string | null;
        seat?: string | null;
      },
    ) => {
      lastAllowedTokenRef.current = ticketToken;
      lastAllowedAtRef.current = Date.now();
      scanPausedUntilRef.current = Date.now() + ALLOWED_SCAN_PAUSE_MS;
      setScanOverlay({ type: "allowed", ...(ticket ?? {}) });
      setCameraStatus("Acesso liberado. Scanner pausado temporariamente.");

      if (scanResumeTimerRef.current) {
        clearTimeout(scanResumeTimerRef.current);
      }

      scanResumeTimerRef.current = setTimeout(() => {
        setScanOverlay(null);
        scanPausedUntilRef.current = 0;
        setCameraStatus("Scanner ativo. Aponte para o QR Code do ingresso.");
        scanResumeTimerRef.current = null;
      }, ALLOWED_SCAN_PAUSE_MS);
    },
    [],
  );

  const pauseScannerAfterDenied = useCallback((message: string) => {
    scanPausedUntilRef.current = Date.now() + ALLOWED_SCAN_PAUSE_MS;
    setScanOverlay({ type: "denied", message });
    setCameraStatus("Acesso recusado. Scanner pausado temporariamente.");

    if (scanResumeTimerRef.current) {
      clearTimeout(scanResumeTimerRef.current);
    }

    scanResumeTimerRef.current = setTimeout(() => {
      setScanOverlay(null);
      scanPausedUntilRef.current = 0;
      setCameraStatus("Scanner ativo. Aponte para o QR Code do ingresso.");
      scanResumeTimerRef.current = null;
    }, ALLOWED_SCAN_PAUSE_MS);
  }, []);

  const submitScan = useCallback(
    async (rawTicketToken: string) => {
      const ticketToken = extractTicketToken(rawTicketToken);
      const now = Date.now();

      if (!ticketToken) {
        return;
      }

      if (!token) {
        registerDeniedResult("Sessão de portaria inválida ou expirada.");
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
          section?: string | null;
          seat?: string | null;
        };

        if (result.allowed) {
          registerAllowedResult(result);
          pauseScannerAfterAllowed(ticketToken, {
            section: result.section,
            seat: result.seat,
          });
          return;
        }

        const deniedMessage = result.message ?? "Entrada recusada.";
        registerDeniedResult(deniedMessage);
        pauseScannerAfterDenied(deniedMessage);
      } catch {
        const deniedMessage = "Não foi possível registrar a leitura.";
        registerDeniedResult(deniedMessage);
        pauseScannerAfterDenied(deniedMessage);
      } finally {
        submittingScanRef.current = false;
      }
    },
    [
      pauseScannerAfterAllowed,
      pauseScannerAfterDenied,
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
          if (result.valid) {
            setAllowedCount(result.summary.allowedCount);
            setDeniedCount(result.summary.deniedCount);
            setLastResult(result.summary.lastResult ?? "Nenhuma leitura ainda.");
          }
        }
      } catch {
        if (!cancelled) {
          setCameraStatus(
            "Sem conexão para atualizar a sessão. O leitor continuará tentando operar.",
          );
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
    let scanner: QrScanner | null = null;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("Câmera não disponível neste navegador.");
        return;
      }

      try {
        if (!videoRef.current) return;
        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (
              cancelled ||
              Date.now() < scanPausedUntilRef.current ||
              !result.data
            ) {
              return;
            }
            void submitScan(result.data);
          },
          {
            preferredCamera: "environment",
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 12,
          },
        );
        await scanner.start();
        if (!cancelled) {
          setCameraStatus("Scanner ativo. Aponte para o QR Code do ingresso.");
        }
      } catch {
        setCameraStatus("Não foi possível acessar a câmera.");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
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

  async function consultTicket() {
    const ticketCode = consultCode.trim();
    if (!ticketCode || !token || consultLoading) return;

    setConsultLoading(true);
    setConsultResult(null);
    setConsultedTicketCode(null);

    try {
      const response = await fetch("/api/gate/session/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateSessionToken: token, ticketCode }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        reason?: string;
        ticket?: {
          code: string;
          status: string;
          eventTitle: string;
          startsAt: string | null;
          section: string | null;
          seat: string | null;
          issuedAt: string;
          usedAt: string | null;
          cancelledAt: string | null;
          validations: Array<{ result: string; createdAt: string }>;
        };
      };

      if (!response.ok || !result.ok || !result.ticket) {
        setConsultResult(
          result.reason === "not_found"
            ? "Ingresso não encontrado para este evento ou sessão."
            : "Não foi possível consultar este ingresso.",
        );
        return;
      }

      const ticket = result.ticket;
      setConsultedTicketCode(ticket.code);
      setConsultResult(
        [
          `Código: ${ticket.code}`,
          `Status: ${ticket.status}`,
          `Evento: ${ticket.eventTitle}`,
          ticket.startsAt ? `Sessão: ${formatDateTime(ticket.startsAt)}` : null,
          ticket.section ? `Setor: ${ticket.section}` : null,
          `Emitido em: ${formatDateTime(ticket.issuedAt)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch {
      setConsultResult("Não foi possível consultar este ingresso.");
    } finally {
      setConsultLoading(false);
    }
  }

  async function validateConsultedTicket() {
    const ticketCode = consultedTicketCode;
    if (!ticketCode || !token || consultLoading) return;

    setConsultLoading(true);

    try {
      const response = await fetch("/api/gate/session/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateSessionToken: token, ticketCode }),
      });
      const result = (await response.json()) as {
        allowed?: boolean;
        message?: string;
        section?: string | null;
        seat?: string | null;
      };

      if (result.allowed) {
        registerAllowedResult(result);
        pauseScannerAfterAllowed(ticketCode, {
          section: result.section,
          seat: result.seat,
        });
        setConsultResult((current) =>
          [current, "", "Entrada validada manualmente."].filter(Boolean).join("\n"),
        );
        setConsultedTicketCode(null);
        return;
      }

      const deniedMessage = result.message ?? "Entrada recusada.";
      registerDeniedResult(deniedMessage);
      pauseScannerAfterDenied(deniedMessage);
      setConsultResult((current) =>
        [current, "", deniedMessage].filter(Boolean).join("\n"),
      );
    } catch {
      const deniedMessage = "Não foi possível validar este ingresso.";
      registerDeniedResult(deniedMessage);
      pauseScannerAfterDenied(deniedMessage);
      setConsultResult((current) =>
        [current, "", deniedMessage].filter(Boolean).join("\n"),
      );
    } finally {
      setConsultLoading(false);
    }
  }

  if (loading) {
    return (
      <InformationPage
        eyebrow="Portaria"
        title="Validando acesso"
        description="Aguarde enquanto validamos este acesso temporário."
      />
    );
  }

  if (!validation?.valid) {
    return (
      <InformationPage
        eyebrow="Portaria"
        title="Acesso inválido"
        description={describeInvalidReason(validation?.reason)}
      />
    );
  }

  return (
    <main className="gate-shell">
      <BrandLogo className="gate-brand-logo" />
      <section className="gate-header">
        <div>
          <p className="gate-kicker">Portaria</p>
          <h1>{validation.gateSession.eventTitle ?? "Evento"}</h1>
          {validation.gateSession.sessionStartsAt ? (
            <p>Sessão: {formatDateTime(validation.gateSession.sessionStartsAt)}</p>
          ) : null}
          {validation.gateSession.gateLabel ? (
            <p>Entrada: {validation.gateSession.gateLabel}</p>
          ) : null}
          <p>Acesso temporário ativo.</p>
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

      <section className={scanOverlay ? "gate-scanner is-paused" : "gate-scanner"}>
        <video ref={videoRef} muted playsInline />
        {scanOverlay ? (
          <div
            className={[
              "gate-access-overlay",
              scanOverlay.type === "denied" ? "is-denied" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            role="status"
            aria-live="assertive"
          >
            <strong>
              {scanOverlay.type === "allowed" ? "ACESSO LIBERADO" : "QR CODE INVÁLIDO"}
            </strong>
            {scanOverlay.type === "denied" && scanOverlay.message ? (
              <span>{scanOverlay.message}</span>
            ) : null}
            {scanOverlay.section ? (
              <span>Setor: {scanOverlay.section}</span>
            ) : null}
            {scanOverlay.seat ? (
              <span>Ingresso/Assento: {scanOverlay.seat}</span>
            ) : null}
          </div>
        ) : null}
        <p>{cameraStatus}</p>
      </section>

      <section className="gate-manual">
        <label htmlFor="manual-ticket-token">Validar ingresso manualmente</label>
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

      <section className="gate-manual">
        <label htmlFor="consult-ticket-code">Consultar ticket sem validar</label>
        <div>
          <input
            id="consult-ticket-code"
            value={consultCode}
            onChange={(event) => {
              setConsultCode(event.target.value);
              setConsultedTicketCode(null);
            }}
            placeholder="TCK-XXXXXXXXXXXX"
          />
          <button
            type="button"
            className={consultedTicketCode ? "is-validate" : undefined}
            onClick={consultedTicketCode ? validateConsultedTicket : consultTicket}
            disabled={consultLoading}
          >
            {consultLoading
              ? consultedTicketCode
                ? "Validando..."
                : "Consultando..."
              : consultedTicketCode
                ? "Validar ingresso"
                : "Consultar"}
          </button>
        </div>
        {consultResult ? <p className="gate-consult-result">{consultResult}</p> : null}
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
