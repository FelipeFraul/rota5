"use client";

import { FormEvent, useState } from "react";

type Props = { onClose: () => void; onCreated: (eventId: string) => void };

function csrf() { return document.cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith("admin_web_csrf="))?.split("=")[1] ?? ""; }
function cents(value: string) { return Math.round(Number(value.replace(",", ".")) * 100); }

export default function CreateEventModal({ onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/events", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-admin-csrf": decodeURIComponent(csrf()) }, body: JSON.stringify({ title: form.get("title"), artistName: form.get("artistName"), city: form.get("city"), state: form.get("state"), venueName: form.get("venueName"), description: form.get("description"), imageUrl: form.get("imageUrl"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), sectionName: form.get("sectionName"), capacity: Number(form.get("capacity")), priceCents: cents(String(form.get("price"))), feeCents: cents(String(form.get("fee") || "0")) }) });
    const data = await response.json() as { ok?: boolean; eventId?: string; message?: string };
    setSaving(false); if (!response.ok || !data.ok || !data.eventId) { setMessage(data.message ?? "Não foi possível criar o evento."); return; } onCreated(data.eventId);
  }
  return <div className="admin-event-modal" role="dialog" aria-modal="true" aria-label="Criar evento" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="admin-event-modal-panel" onSubmit={submit}><header><div><p className="admin-events-kicker">Novo evento</p><h2>Criar evento</h2></div><button type="button" className="admin-event-icon-button" onClick={onClose} disabled={saving}>×</button></header><div className="admin-event-modal-content"><div className="admin-event-form-grid"><label>Nome do evento<input name="title" required /></label><label>Artista<input name="artistName" /></label><label>Cidade<input name="city" required /></label><label>UF<input name="state" maxLength={2} required /></label><label>Local<input name="venueName" required /></label><label>Data e hora<input name="startsAt" type="datetime-local" required /></label><label>Setor<input name="sectionName" defaultValue="Entrada geral" required /></label><label>Capacidade<input name="capacity" type="number" min="1" defaultValue="100" required /></label><label>Preço (R$)<input name="price" inputMode="decimal" defaultValue="0" required /></label><label>Taxa (R$)<input name="fee" inputMode="decimal" defaultValue="0" /></label><label>Imagem (URL)<input name="imageUrl" type="url" /></label><label className="admin-event-form-full">Descrição<textarea name="description" rows={4} /></label></div>{message ? <p className="admin-events-message">{message}</p> : null}</div><footer><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Criando..." : "Criar evento"}</button></footer></form></div>;
}
