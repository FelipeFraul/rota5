"use client";

import { FormEvent, useRef, useState } from "react";
import {
  createEventSubmissionController,
  type CreateEventSubmissionController,
} from "./createEventSubmission";

type Props = { onClose: () => void; onCreated: (eventId: string) => void };

function csrf() { return document.cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith("admin_web_csrf="))?.split("=")[1] ?? ""; }
function cents(value: string) { return Math.round(Number(value.replace(",", ".")) * 100); }

export default function CreateEventModal({ onClose, onCreated }: Props) {
  const submission = useRef<CreateEventSubmissionController | null>(null);
  submission.current ??= createEventSubmissionController();
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null); const [tab, setTab] = useState<"event" | "sessions" | "sections" | "prices">("event");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const { response, data } = await submission.current!.run(async (operationId) => {
        const response = await fetch("/api/admin/events", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-admin-csrf": decodeURIComponent(csrf()), "x-idempotency-key": operationId }, body: JSON.stringify({ title: form.get("title"), artistName: form.get("artistName"), city: form.get("city"), state: form.get("state"), venueName: form.get("venueName"), description: form.get("description"), imageUrl: form.get("imageUrl"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), sectionName: form.get("sectionName"), capacity: Number(form.get("capacity")), priceCents: cents(String(form.get("price"))), feeCents: cents(String(form.get("fee") || "0")) }) });
        const data = await response.json() as { ok?: boolean; eventId?: string; message?: string };
        return { response, data };
      }, () => setSaving(false));
      if (!response.ok || !data.ok || !data.eventId) { setMessage(data.message ?? "Não foi possível criar o evento."); return; }
      onCreated(data.eventId);
    } catch {
      setMessage("Não foi possível criar o evento.");
    }
  }
  return <div className="admin-event-modal" role="dialog" aria-modal="true" aria-label="Criar evento" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="admin-event-modal-panel" onSubmit={submit}><header><div><p className="admin-events-kicker">Criando</p><h2>Novo evento</h2></div><button type="button" className="admin-event-icon-button" onClick={onClose} disabled={saving}>&times;</button></header><nav className="admin-event-tabs" aria-label="?reas do evento"><button type="button" className={tab === "event" ? "is-active" : ""} onClick={() => setTab("event")}>Evento</button><button type="button" className={tab === "sessions" ? "is-active" : ""} onClick={() => setTab("sessions")}>Sess&#245;es</button><button type="button" className={tab === "sections" ? "is-active" : ""} onClick={() => setTab("sections")}>Setores</button><button type="button" className={tab === "prices" ? "is-active" : ""} onClick={() => setTab("prices")}>Pre&#231;os</button></nav><div className="admin-event-modal-content"><div hidden={tab !== "event"} className="admin-event-form-grid"><label>T&#237;tulo<input name="title" required /></label><label>Artista<input name="artistName" /></label><label>Cidade<input name="city" required /></label><label>UF<input name="state" maxLength={2} required /></label><label>Local<input name="venueName" required /></label><label className="admin-event-field-wide">URL da foto<input name="imageUrl" type="url" /></label><label className="admin-event-field-wide">Descri&#231;&#227;o<textarea name="description" rows={4} /></label></div><div hidden={tab !== "sessions"} className="admin-event-form-grid"><label>Data e hora<input name="startsAt" type="datetime-local" required /></label></div><div hidden={tab !== "sections"} className="admin-event-form-grid"><label>Nome do setor<input name="sectionName" defaultValue="Entrada geral" required /></label><label>Carga<input name="capacity" type="number" min="1" defaultValue="100" required /></label></div><div hidden={tab !== "prices"} className="admin-event-form-grid"><label>Valor<input name="price" inputMode="decimal" defaultValue="0" required /></label><label>Taxa<input name="fee" inputMode="decimal" defaultValue="0" /></label></div></div>{message ? <p className="admin-events-message">{message}</p> : null}<footer><span>Os dados ser&#227;o validados antes de criar o rascunho.</span><button type="submit" disabled={saving}>{saving ? "Criando..." : "Criar evento"}</button></footer></form></div>;
}
