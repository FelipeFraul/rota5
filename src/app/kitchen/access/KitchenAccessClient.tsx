"use client";

import { useEffect, useRef, useState } from "react";
import BrandLogo from "@/app/BrandLogo";

export function KitchenAccessClient({
  token,
  reader,
}: {
  token: string;
  reader: boolean;
}) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function openAccess() {
      try {
        const response = await fetch("/api/kitchen/session/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, reader }),
          cache: "no-store",
        });
        const result = (await response.json()) as {
          ok?: boolean;
          target?: string;
          message?: string;
        };
        if (!response.ok || !result.ok || !result.target) {
          setError(result.message ?? "Não foi possível abrir este acesso.");
          return;
        }
        window.location.replace(result.target);
      } catch {
        setError("Não foi possível abrir este acesso. Verifique a conexão.");
      }
    }

    void openAccess();
  }, [reader, token]);

  return (
    <main className={reader ? "gate-shell" : "kitchen-shell"}>
      <section className={reader ? "gate-header" : "kitchen-empty"}>
        <BrandLogo className="gate-brand-logo" />
        <h1>{reader ? "Abrindo leitor de oferta" : "Abrindo Sistema Cozinha"}</h1>
        <p>{error ?? "Validando este navegador..."}</p>
        {error ? (
          <button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        ) : null}
      </section>
    </main>
  );
}
