"use client";

import dynamic from "next/dynamic";
import { FormEvent, type MouseEvent, useCallback, useEffect, useState } from "react";
import type {
  ActiveTab,
  Draft,
  EventDetails,
  EventStatus,
  PriceStatus,
  SaveFeedback,
  SectionStatus,
  SessionStatus,
} from "../AdminEventsEditor";

const EventTableMapTab = dynamic(() => import("./EventTableMapTab"), {
  loading: () => <p className="admin-events-empty">Carregando mapa...</p>,
});
const SaveFeedbackOverlay = dynamic(() => import("../components/SaveFeedbackOverlay"), {
  loading: () => null,
});

export type EventEditorModalProps = {
  eventId: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("admin_web_csrf="))
    ?.split("=")[1] ?? "";
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildDraft(event: EventDetails): Draft {
  const draft: Draft = {
    event: {
      title: event.title,
      artistName: event.artistName,
      city: event.city,
      state: event.state,
      venueName: event.venueName ?? "",
      description: event.description ?? "",
      imageUrl: event.imageUrl ?? "",
      status: event.status,
    },
    sessions: event.sessions.map((session) => ({
      sessionId: session.sessionId,
      startsAt: session.startsAt,
      status: session.status,
    })),
    sections: event.sections.map((section) => ({
      sectionId: section.sectionId,
      name: section.name,
      capacity: section.capacity,
      status: section.status,
    })),
    newSections: [],
    prices: event.prices.map((price) => ({
      priceId: price.priceId,
      sectionId: price.sectionId,
      sectionName: price.sectionName,
      label: price.label,
      price: moneyFromCents(price.priceCents),
      fee: moneyFromCents(price.feeCents),
      salesStartAt: price.salesStartAt,
      salesEndAt: price.salesEndAt,
      status: price.status,
    })),
    courtesy: {
      sections: event.courtesy.sections.map((section) => ({
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        label: section.label,
        limit: section.limit,
        status: section.status,
      })),
    },
  };

  return syncDraftWithSections(draft, draft.sections);
}

function sortDraftRowsBySectionOrder<T extends { sectionId: string | null }>(
  rows: T[],
  sections: Draft["sections"],
) {
  const orderBySectionId = new Map(
    sections.map((section, index) => [section.sectionId, index]),
  );

  return [...rows].sort(
    (left, right) =>
      (left.sectionId ? orderBySectionId.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER) -
      (right.sectionId ? orderBySectionId.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER),
  );
}

function syncDraftWithSections(draft: Draft, sections: Draft["sections"]): Draft {
  const sectionNameById = new Map(
    sections.map((section) => [section.sectionId, section.name]),
  );

  return {
    ...draft,
    sections,
    prices: sortDraftRowsBySectionOrder(
      draft.prices.map((price) => {
        const sectionName = price.sectionId ? sectionNameById.get(price.sectionId) : null;
        return sectionName
          ? { ...price, sectionName }
          : price;
      }),
      sections,
    ),
    courtesy: {
      sections: draft.courtesy.sections.map((courtesy) => {
        const sectionName = sectionNameById.get(courtesy.sectionId);
        return sectionName ? { ...courtesy, sectionName } : courtesy;
      }),
    },
  };
}

function getDraftPriceSectionName(draft: Draft, price: Draft["prices"][number]) {
  return (
    draft.sections.find((section) => section.sectionId === price.sectionId)?.name ??
    price.sectionName ??
    "Sem setor"
  );
}

function getDraftCourtesySectionName(draft: Draft, courtesy: Draft["courtesy"]["sections"][number]) {
  return (
    draft.sections.find((section) => section.sectionId === courtesy.sectionId)?.name ??
    courtesy.sectionName ??
    "Setor"
  );
}

function createNewSectionDraft(): Draft["newSections"][number] {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    clientId: randomId,
    name: "",
    capacity: 1,
  };
}

function closeOnOverlayClick(
  event: MouseEvent<HTMLDivElement>,
  onClose: () => void,
) {
  if (event.target === event.currentTarget) {
    onClose();
  }
}

export default function EventEditorModal({ eventId, onClose, onSaved }: EventEditorModalProps) {
  const [selected, setSelected] = useState<EventDetails | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("event");
  const [message, setMessage] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      setMessage(null);

      try {
        const response = await fetch(`/api/admin/events/${eventId}`, {
          credentials: "same-origin",
        });
        const data = await response.json() as { ok?: boolean; event?: EventDetails; message?: string };

        if (!active) return;

        if (!response.ok || !data.ok || !data.event) {
          setMessage(data.message ?? "Não foi possível abrir o evento.");
          return;
        }

        setSelected(data.event);
        setDraft(buildDraft(data.event));
        setActiveTab("event");
      } catch {
        if (active) setMessage("Não foi possível abrir o evento.");
      }
    }

    void loadEvent();

    return () => {
      active = false;
    };
  }, [eventId]);

  const persistDraft = useCallback(async () => {
    if (!selected || !draft) return false;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${selected.eventId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
        body: JSON.stringify(draft),
      });
      const data = await response.json() as { ok?: boolean; event?: EventDetails; message?: string };

      if (!response.ok || !data.ok || !data.event) {
        setMessage(data.message ?? "Não foi possível salvar.");
        return false;
      }

      setSelected(data.event);
      setDraft(buildDraft(data.event));
      setMessage(null);
      await onSaved();
      return true;
    } catch {
      setMessage("Não foi possível salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, selected]);

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveFeedback({ state: "loading", label: "Salvando alterações" });
    const saved = await persistDraft();

    if (!saved) {
      setSaveFeedback(null);
      return;
    }

    setSaveFeedback({ state: "success", label: "Salvo" });
    await wait(650);
    setSaveFeedback(null);
    onClose();
  }

  function changeTab(nextTab: ActiveTab) {
    if (nextTab === activeTab || saving) return;
    setActiveTab(nextTab);
  }

  return (
    <>
      <div
        className="admin-event-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Editar evento"
        onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
      >
        <form className="admin-event-modal-panel" onSubmit={saveEvent}>
          <header>
            <div>
              <p className="admin-events-kicker">Editando</p>
              <h2>{selected?.title ?? "Carregando..."}</h2>
            </div>
            <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar">&times;</button>
          </header>

          {message ? <p className="admin-events-message">{message}</p> : null}

          {selected && draft ? (
            <>
              <nav className="admin-event-tabs" aria-label="Áreas do evento">
                <button type="button" className={activeTab === "event" ? "is-active" : ""} disabled={saving} onClick={() => changeTab("event")}>Evento</button>
                <button type="button" className={activeTab === "sessions" ? "is-active" : ""} disabled={saving} onClick={() => changeTab("sessions")}>Sessões</button>
                <button type="button" className={activeTab === "sections" ? "is-active" : ""} disabled={saving} onClick={() => changeTab("sections")}>Setores</button>
                <button type="button" className={activeTab === "prices" ? "is-active" : ""} disabled={saving} onClick={() => changeTab("prices")}>Preços</button>
                <button type="button" className={activeTab === "courtesy" ? "is-active" : ""} disabled={saving} onClick={() => changeTab("courtesy")}>Cortesia</button>
                <button type="button" className={activeTab === "tableMap" ? "is-active" : ""} disabled={saving} onClick={() => changeTab("tableMap")}>Mapa de Mesas</button>
              </nav>

              <div className={`admin-event-modal-content ${activeTab === "tableMap" ? "is-table-map" : ""}`}>
                {activeTab === "event" ? (
                  <div className="admin-event-form-grid">
                    <label>Título<input value={draft.event.title} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, title: event.target.value } })} /></label>
                    <label>Cidade<input value={draft.event.city} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, city: event.target.value } })} /></label>
                    <label>UF<input value={draft.event.state} maxLength={2} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, state: event.target.value.toUpperCase() } })} /></label>
                    <label>Local<input value={draft.event.venueName} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, venueName: event.target.value } })} /></label>
                    <label>Status<select value={draft.event.status} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, status: event.target.value as EventStatus } })}>
                      <option value="draft">Pausado</option>
                      <option value="published">Publicado</option>
                      <option value="cancelled">Cancelado</option>
                      <option value="finished">Finalizado</option>
                    </select></label>
                    <label className="admin-event-field-wide">URL da foto<input value={draft.event.imageUrl} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, imageUrl: event.target.value } })} /></label>
                    <label className="admin-event-field-wide">Descrição<textarea value={draft.event.description} onChange={(event) => setDraft({ ...draft, event: { ...draft.event, description: event.target.value } })} /></label>
                  </div>
                ) : null}

                {activeTab === "sessions" ? (
                  <div className="admin-event-list-editor">
                    {draft.sessions.map((session, index) => (
                      <div key={session.sessionId} className="admin-event-edit-row">
                        <label>Data e hora<input type="datetime-local" value={toDateTimeLocal(session.startsAt)} onChange={(event) => {
                          const sessions = [...draft.sessions];
                          sessions[index] = { ...session, startsAt: fromDateTimeLocal(event.target.value) ?? session.startsAt };
                          setDraft({ ...draft, sessions });
                        }} /></label>
                        <label>Status<select value={session.status} onChange={(event) => {
                          const sessions = [...draft.sessions];
                          sessions[index] = { ...session, status: event.target.value as SessionStatus };
                          setDraft({ ...draft, sessions });
                        }}>
                          <option value="scheduled">Agendado</option>
                          <option value="sales_open">Venda aberta</option>
                          <option value="sales_closed">Venda fechada</option>
                          <option value="cancelled">Cancelado</option>
                          <option value="finished">Finalizado</option>
                        </select></label>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeTab === "sections" ? (
                  <div className="admin-event-list-editor">
                    <div className="admin-event-list-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({
                            ...draft,
                            newSections: [...draft.newSections, createNewSectionDraft()],
                          });
                        }}
                      >
                        Criar novo setor
                      </button>
                    </div>
                    {draft.sections.map((section, index) => {
                      const original = selected.sections.find((item) => item.sectionId === section.sectionId);

                      return (
                        <div key={section.sectionId} className="admin-event-edit-row">
                          <label>Nome<input value={section.name} onChange={(event) => {
                            const sections = [...draft.sections];
                            sections[index] = { ...section, name: event.target.value };
                            setDraft(syncDraftWithSections(draft, sections));
                          }} /></label>
                          <label>Carga<input type="number" min={1} disabled={original?.hasNumberedSeats} value={section.capacity ?? ""} onChange={(event) => {
                            const sections = [...draft.sections];
                            sections[index] = { ...section, capacity: event.target.value ? Number(event.target.value) : null };
                            setDraft(syncDraftWithSections(draft, sections));
                          }} /></label>
                          <label>Status<select value={section.status} onChange={(event) => {
                            const sections = [...draft.sections];
                            sections[index] = { ...section, status: event.target.value as SectionStatus };
                            setDraft(syncDraftWithSections(draft, sections));
                          }}>
                            <option value="active">Ativo</option>
                            <option value="inactive">Inativo</option>
                          </select></label>
                        </div>
                      );
                    })}
                    {draft.newSections.map((section, index) => (
                      <div key={section.clientId} className="admin-event-edit-row">
                        <label>Nome<input value={section.name} placeholder="Nome do novo setor" onChange={(event) => {
                          const newSections = [...draft.newSections];
                          newSections[index] = { ...section, name: event.target.value };
                          setDraft({ ...draft, newSections });
                        }} /></label>
                        <label>Carga<input type="number" min={1} value={section.capacity} onChange={(event) => {
                          const newSections = [...draft.newSections];
                          newSections[index] = { ...section, capacity: Math.max(1, Number(event.target.value) || 1) };
                          setDraft({ ...draft, newSections });
                        }} /></label>
                        <label>Ação<button type="button" className="admin-event-inline-danger" onClick={() => {
                          setDraft({
                            ...draft,
                            newSections: draft.newSections.filter((item) => item.clientId !== section.clientId),
                          });
                        }}>Remover</button></label>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeTab === "prices" ? (
                  <div className="admin-event-list-editor">
                    {draft.prices.map((price, index) => (
                      <div key={price.priceId} className="admin-event-edit-row admin-event-price-row">
                        <label>Setor<input value={getDraftPriceSectionName(draft, price)} readOnly /></label>
                        <label>Nome no ingresso<input value={price.label} onChange={(event) => {
                          const prices = [...draft.prices];
                          prices[index] = { ...price, label: event.target.value };
                          setDraft({ ...draft, prices });
                        }} /></label>
                        <label>Valor<input value={price.price} onChange={(event) => {
                          const prices = [...draft.prices];
                          prices[index] = { ...price, price: event.target.value };
                          setDraft({ ...draft, prices });
                        }} /></label>
                        <label>Taxa<input value={price.fee} onChange={(event) => {
                          const prices = [...draft.prices];
                          prices[index] = { ...price, fee: event.target.value };
                          setDraft({ ...draft, prices });
                        }} /></label>
                        <label>Status<select value={price.status} onChange={(event) => {
                          const prices = [...draft.prices];
                          prices[index] = { ...price, status: event.target.value as PriceStatus };
                          setDraft({ ...draft, prices });
                        }}>
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                        </select></label>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeTab === "courtesy" ? (
                  <div className="admin-event-list-editor">
                    {draft.courtesy.sections.map((courtesy, index) => (
                      <div key={courtesy.sectionId} className="admin-event-edit-row admin-event-courtesy-row">
                        <label>Setor<input value={getDraftCourtesySectionName(draft, courtesy)} readOnly /></label>
                        <label>Nome no ingresso<input value={courtesy.label} onChange={(event) => {
                          const sections = [...draft.courtesy.sections];
                          sections[index] = { ...courtesy, label: event.target.value };
                          setDraft({ ...draft, courtesy: { sections } });
                        }} /></label>
                        <label>Número de cortesias<input type="number" min={0} max={100000} value={courtesy.limit} onChange={(event) => {
                          const sections = [...draft.courtesy.sections];
                          sections[index] = { ...courtesy, limit: Math.max(0, Number(event.target.value) || 0) };
                          setDraft({ ...draft, courtesy: { sections } });
                        }} /></label>
                        <label>Status<select value={courtesy.status} onChange={(event) => {
                          const sections = [...draft.courtesy.sections];
                          sections[index] = { ...courtesy, status: event.target.value as SectionStatus };
                          setDraft({ ...draft, courtesy: { sections } });
                        }}>
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                        </select></label>
                      </div>
                    ))}
                  </div>
                ) : null}

                {activeTab === "tableMap" ? (
                  <EventTableMapTab />
                ) : null}
              </div>

              {activeTab !== "tableMap" ? (
                <footer>
                  <span>Alterações são validadas no servidor antes de gravar.</span>
                  <button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
                </footer>
              ) : null}
            </>
          ) : null}
        </form>
      </div>

      {saveFeedback ? (
        <SaveFeedbackOverlay feedback={saveFeedback} />
      ) : null}
    </>
  );
}
