"use client";

import { FormEvent, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

function getRouteToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function AdminLoginForm() {
  const params = useParams<{ token?: string | string[] }>();
  const searchParams = useSearchParams();
  const token = getRouteToken(params.token);
  const mode = searchParams.get("mode") === "event_editor" ? "event_editor" : null;
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token, passphrase, mode }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        code?: string;
        adminUrl?: string;
        message?: string;
      };

      if (!response.ok || !data.ok || (mode !== "event_editor" && !data.code)) {
        setError(data.message ?? "N?o foi poss?vel autenticar este acesso.");
        return;
      }

      if (mode === "event_editor") {
        setAdminUrl(data.adminUrl ?? "/admin/eventos");
      } else {
        setCode(data.code ?? null);
      }
      setPassphrase("");
    } catch {
      setError("N?o foi poss?vel autenticar este acesso agora.");
    } finally {
      setLoading(false);
    }
  }

  if (adminUrl || code) {
    return (
      <div className="page-card-stack">
        <section className="admin-login-card">
          <p className="admin-login-kicker">Senha confirmada</p>
          {adminUrl ? (
            <>
              <h1>Acesso liberado</h1>
              <p>Agora voce pode abrir o editor de eventos neste navegador.</p>
              <a className="admin-login-link-button" href={adminUrl}>
                Abrir editor de eventos
              </a>
              <p className="admin-login-muted">Sessao valida por 4 horas.</p>
            </>
          ) : (
            <>
              <h1>Codigo de uso unico</h1>
              <div className="admin-login-code" aria-label="Codigo de uso unico">
                {code}
              </div>
              <p>Volte ao WhatsApp e envie este codigo para liberar o menu administrativo.</p>
              <p className="admin-login-muted">Codigo valido por 2 minutos.</p>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page-card-stack">
      <section className="admin-login-card">
        <p className="admin-login-kicker">Login administrativo</p>
        <h1>Informe sua senha individual</h1>
        <p>
          Este link e temporario e libera o editor apenas depois da validacao
          da sua senha individual.
        </p>
        <p className="admin-login-muted">Link temporario valido por 2 minutos.</p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label htmlFor="admin-passphrase">Senha individual</label>
          <input
            id="admin-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            disabled={loading}
            minLength={1}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        {error ? <p className="admin-login-error">{error}</p> : null}
      </section>
    </div>
  );
}
