"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";

type AdminLoginFormProps = {
  expiresAt: string;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRouteToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function AdminLoginForm({ expiresAt }: AdminLoginFormProps) {
  const params = useParams<{ token?: string | string[] }>();
  const token = getRouteToken(params.token);
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);

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
        body: JSON.stringify({ token, passphrase }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        code?: string;
        expiresAt?: string;
        message?: string;
      };

      if (!response.ok || !data.ok || !data.code || !data.expiresAt) {
        setError(data.message ?? "Não foi possível autenticar este acesso.");
        return;
      }

      setCode(data.code);
      setCodeExpiresAt(data.expiresAt);
      setPassphrase("");
    } catch {
      setError("Não foi possível autenticar este acesso agora.");
    } finally {
      setLoading(false);
    }
  }

  if (code) {
    return (
      <section className="admin-login-card">
        <p className="admin-login-kicker">Senha confirmada</p>
        <h1>Código de uso único</h1>
        <div className="admin-login-code" aria-label="Código de uso único">
          {code}
        </div>
        <p>
          Volte ao WhatsApp e envie este código para liberar o menu
          administrativo.
        </p>
        {codeExpiresAt ? (
          <p className="admin-login-muted">
            Expira às {formatTime(codeExpiresAt)}.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="admin-login-card">
      <p className="admin-login-kicker">Login administrativo</p>
      <h1>Informe sua senha individual</h1>
      <p>
        Este link é temporário e só libera acesso depois que o código for
        enviado no WhatsApp.
      </p>
      <p className="admin-login-muted">Link expira às {formatTime(expiresAt)}.</p>

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
          {loading ? "Verificando..." : "Gerar código"}
        </button>
      </form>

      {error ? <p className="admin-login-error">{error}</p> : null}
    </section>
  );
}
