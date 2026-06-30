"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QrScanner from "qr-scanner";
import BrandLogo from "@/app/BrandLogo";

export function OfferQrScanner({ initialValid }: { initialValid: boolean }) {
  const params = useParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token)
    ? params.token[0] ?? ""
    : params.token ?? "";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("Aguardando QR Code.");
  const [resultType, setResultType] = useState<"allowed" | "denied" | "waiting" | null>(null);

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
        setResultType(
          result.allowed
            ? "allowed"
            : result.result === "awaiting_preparation"
              ? "waiting"
              : "denied",
        );
        setStatus(
          result.allowed
            ? `ENTREGUE: ${result.offerName ?? "Pedido"} - quantidade ${result.quantity ?? 1}.`
            : result.message ?? "QR Code recusado.",
        );
      } catch {
        setResultType("denied");
        setStatus("Nao foi possivel validar o QR Code.");
      } finally {
        window.setTimeout(() => {
          busyRef.current = false;
        }, 2500);
      }
    },
    [token],
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
      <section className="gate-scanner">
        <video ref={videoRef} muted playsInline />
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
        className={`gate-result ${resultType === "allowed" ? "is-validating" : resultType === "denied" || resultType === "waiting" ? "is-denying" : ""}`}
      >
        <h2>Resultado</h2>
        <p>{status}</p>
      </section>
    </main>
  );
}
