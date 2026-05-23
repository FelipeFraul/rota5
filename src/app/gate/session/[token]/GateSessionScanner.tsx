"use client";

import { useEffect, useRef, useState } from "react";

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

export function GateSessionScanner({
  token,
  initialValidation,
}: GateSessionScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<string | null>(null);
  const [validation, setValidation] =
    useState<GateSessionValidation>(initialValidation);
  const [loading, setLoading] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Aguardando câmera...");
  const [lastResult, setLastResult] = useState("Nenhuma leitura ainda.");
  const [manualCode, setManualCode] = useState("");
  const [readsCount, setReadsCount] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);

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
    };
  }, [initialValidation.valid, token]);

  useEffect(() => {
    if (!validation?.valid) {
      return;
    }

    let cancelled = false;
    let animationFrame = 0;

    async function submitScan(ticketToken: string) {
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
          received?: boolean;
          message?: string;
        };

        if (result.received) {
          setReadsCount((count) => count + 1);
          setLastResult(result.message ?? "Leitura recebida.");
          return;
        }

        setErrorsCount((count) => count + 1);
        setLastResult(result.message ?? "Leitura recusada pela sessão.");
      } catch {
        setErrorsCount((count) => count + 1);
        setLastResult("Não foi possível registrar a leitura.");
      }
    }

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

          try {
            const codes = await detector.detect(videoRef.current);
            const rawValue = codes[0]?.rawValue;

            if (rawValue && rawValue !== lastScanRef.current) {
              lastScanRef.current = rawValue;
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
  }, [token, validation]);

  async function submitManualCode() {
    const value = manualCode.trim();

    if (!value) {
      return;
    }

    lastScanRef.current = value;
    setManualCode("");

    try {
      const response = await fetch("/api/gate/session/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gateSessionToken: token,
          ticketToken: value,
        }),
      });
      const result = (await response.json()) as {
        received?: boolean;
        message?: string;
      };

      if (result.received) {
        setReadsCount((count) => count + 1);
        setLastResult(result.message ?? "Leitura recebida.");
        return;
      }

      setErrorsCount((count) => count + 1);
      setLastResult(result.message ?? "Leitura recusada pela sessão.");
    } catch {
      setErrorsCount((count) => count + 1);
      setLastResult("Não foi possível registrar a leitura.");
    }
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
          <h1>{validation.gateSession.gateLabel ?? "Entrada"}</h1>
          <p>Validade: {formatDateTime(validation.gateSession.expiresAt)}</p>
          <p>Validador: final {validation.gateSession.validatorPhoneLast4}</p>
        </div>
        <span className="gate-status">Sessão ativa</span>
      </section>

      <section className="gate-counters" aria-label="Contadores de leitura">
        <div>
          <strong>{readsCount}</strong>
          <span>Leituras</span>
        </div>
        <div>
          <strong>{errorsCount}</strong>
          <span>Erros</span>
        </div>
      </section>

      <section className="gate-scanner">
        <video ref={videoRef} muted playsInline />
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

      <section className="gate-result">
        <h2>Último resultado</h2>
        <p>{lastResult}</p>
        <small>
          Neste passo a leitura é preparatória. A validação real de uso único
          será ativada no próximo passo.
        </small>
      </section>
    </main>
  );
}
