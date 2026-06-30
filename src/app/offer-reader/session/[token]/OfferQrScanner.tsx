"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QrScanner from "qr-scanner";
import BrandLogo from "@/app/BrandLogo";

type ResultType = "allowed" | "denied" | "waiting";

async function playScanFeedback(type: ResultType) {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    await context.resume();
    const frequencies =
      type === "allowed"
        ? [880, 1_120]
        : type === "waiting"
          ? [520]
          : [220, 180];

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startsAt = context.currentTime + index * 0.14;
      oscillator.type = type === "denied" ? "sawtooth" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(0.22, startsAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.13);
    });

    window.setTimeout(() => void context.close(), frequencies.length * 140 + 180);
  } catch {
    // Visual feedback remains available when autoplay/audio is blocked.
  }
}

export function OfferQrScanner({ initialValid }: { initialValid: boolean }) {
  const params = useParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token)
    ? params.token[0] ?? ""
    : params.token ?? "";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("Aguardando QR Code.");
  const [resultType, setResultType] = useState<ResultType | null>(null);

  const showFeedback = useCallback((type: ResultType, message: string) => {
    setResultType(type);
    setStatus(message);
    void playScanFeedback(type);
    if (navigator.vibrate) {
      navigator.vibrate(
        type === "allowed" ? [120, 60, 120] : type === "waiting" ? 180 : [250, 80, 250],
      );
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setResultType(null);
      setStatus("Scanner ativo. Aponte para o QR Code.");
      feedbackTimerRef.current = null;
    }, 4_000);
  }, []);

  const scan = useCallback(
    async (comboToken: string) => {
      const value = comboToken.trim();
      if (!value || busyRef.current) return;
      const now = Date.now();
      if (
        lastScanRef.current?.value === value &&
        now - lastScanRef.current.at < 10_000
      ) {
        return;
      }
      lastScanRef.current = { value, at: now };
      busyRef.current = true;
      try {
        const response = await fetch("/api/kitchen/session/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kitchenSessionToken: token, comboToken: value }),
        });
        const result = (await response.json()) as {
          allowed?: boolean;
          result?: string;
          message?: string;
          offerName?: string;
          quantity?: number;
        };
        const type: ResultType = result.allowed
          ? "allowed"
          : result.result === "awaiting_preparation"
            ? "waiting"
            : "denied";
        showFeedback(
          type,
          result.allowed
            ? `ENTREGUE: ${result.offerName ?? "Pedido"} - quantidade ${result.quantity ?? 1}.`
            : result.message ?? "QR Code recusado.",
        );
      } catch {
        showFeedback("denied", "Nao foi possivel validar o QR Code.");
      } finally {
        window.setTimeout(() => {
          busyRef.current = false;
        }, 4_000);
      }
    },
    [showFeedback, token],
  );

  useEffect(() => {
    if (!initialValid) return;
    let cancelled = false;
    let scanner: QrScanner | null = null;

    async function start() {
      try {
        if (!videoRef.current) return;
        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (!cancelled && result.data) void scan(result.data);
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
        if (!cancelled) setStatus("Scanner ativo. Aponte para o QR Code.");
      } catch {
        setStatus("Camera indisponivel. Use o campo manual.");
      }
    }

    start();
    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [initialValid, scan]);

  if (!initialValid) {
    return (
      <main className="gate-shell">
        <h1>Acesso invalido</h1>
        <p>Solicite um novo link do Leitor de Oferta.</p>
      </main>
    );
  }

  return (
    <main className="gate-shell">
      <BrandLogo className="gate-brand-logo" />
      <section className="gate-header">
        <div>
          <p className="gate-kicker">Leitor de Oferta</p>
          <h1>Ler oferta</h1>
          <p>
            A entrega só será confirmada quando o pedido estiver em preparo.
          </p>
        </div>
        <span className="gate-status">Online</span>
      </section>
      <section className={resultType ? "gate-scanner is-paused" : "gate-scanner"}>
        <video ref={videoRef} muted playsInline />
        {resultType ? (
          <div
            className={[
              "gate-access-overlay",
              resultType === "denied" ? "is-denied" : null,
              resultType === "waiting" ? "is-waiting" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            role="status"
            aria-live="assertive"
          >
            <strong>
              {resultType === "allowed"
                ? "ENTREGA LIBERADA"
                : resultType === "waiting"
                  ? "AGUARDANDO PREPARO"
                  : "QR CODE RECUSADO"}
            </strong>
            <span>{status}</span>
          </div>
        ) : null}
        <p>{status}</p>
      </section>
      <section className="gate-manual">
        <label htmlFor="offer-code">Leitura manual</label>
        <div>
          <input
            id="offer-code"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Cole o conteudo do QR Code"
          />
          <button
            type="button"
            onClick={() => {
              scan(manualCode);
              setManualCode("");
            }}
          >
            Ler oferta
          </button>
        </div>
      </section>
      <section
        className={`gate-result ${resultType === "allowed" ? "is-validating" : resultType === "waiting" ? "is-waiting" : resultType === "denied" ? "is-denying" : ""}`}
      >
        <h2>Resultado</h2>
        <p>{status}</p>
      </section>
    </main>
  );
}
