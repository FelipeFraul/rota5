"use client";

import { FormEvent, useState } from "react";

export function AdminLoginForm() {
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

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
        body: JSON.stringify({ passphrase }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
      };

      if (!response.ok || !data.ok || !data.code) {
        setError(data.message ?? "Não foi possível autenticar este acesso.");
        return;
      }

      setCode(data.code);
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
        <p className="admin-login-muted">Código válido por 2 minutos.</p>
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
      <p className="admin-login-muted">Link temporário válido por 2 minutos.</p>

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
