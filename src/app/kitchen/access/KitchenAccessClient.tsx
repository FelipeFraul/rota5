"use client";

import { useEffect, useRef, useState } from "react";
import { InformationPage } from "@/app/InformationPage";

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
    <InformationPage
      eyebrow={reader ? "Leitor de oferta" : "Sistema cozinha"}
      title={reader ? "Abrindo leitor de oferta" : "Abrindo Sistema Cozinha"}
      description={error ?? "Validando este navegador..."}
    >
      {error ? (
        <button type="button" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      ) : null}
    </InformationPage>
  );
}
