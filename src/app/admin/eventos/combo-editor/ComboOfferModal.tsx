"use client";

import type { FormEvent } from "react";
import type { ComboOfferDraft, ComboOfferSummary, EventSummary, ComboOfferTimingType } from "../AdminEventsEditor";

type ComboOfferModalProps = {
  offer: ComboOfferSummary;
  draft: ComboOfferDraft;
  events: EventSummary[];
  saving: boolean;
  onClose: () => void;
  onDraftChange: (draft: ComboOfferDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function closeOnOverlayClick(event: React.MouseEvent<HTMLDivElement>, onClose: () => void) {
  if (event.target === event.currentTarget) onClose();
}

export default function ComboOfferModal({
  offer,
  draft,
  events,
  saving,
  onClose,
  onDraftChange,
  onSubmit,
}: ComboOfferModalProps) {
  const selectedEventIds = draft.eventIds.filter((eventId) => (
    events.some((event) => event.eventId === eventId)
  ));
  const selectedEventSet = new Set(selectedEventIds);
  const availableEvents = events.filter((event) => !selectedEventSet.has(event.eventId));
  const eventsById = new Map(events.map((event) => [event.eventId, event]));

  function addEvent(eventId: string) {
    if (!eventId || selectedEventSet.has(eventId)) return;
    onDraftChange({ ...draft, eventIds: [...selectedEventIds, eventId] });
  }

  function removeEvent(eventId: string) {
    onDraftChange({
      ...draft,
      eventIds: selectedEventIds.filter((currentEventId) => currentEventId !== eventId),
    });
  }

  return (
    <div
      className="admin-event-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Editar combo"
      onMouseDown={(event) => closeOnOverlayClick(event, () => {
        if (!saving) onClose();
      })}
    >
      <form className="admin-event-modal-panel admin-combo-offer-modal-panel" onSubmit={onSubmit}>
        <header>
          <div>
            <p className="admin-events-kicker">Editando combo</p>
            <h2>{offer.name}</h2>
          </div>
          <button
            type="button"
            className="admin-event-icon-button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar"
          >
            &times;
          </button>
        </header>

        <div className="admin-event-modal-content">
          <div className="admin-event-form-grid">
            <label>Nome<input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
            <label>De: R$<input value={draft.originalPrice} onChange={(event) => onDraftChange({ ...draft, originalPrice: event.target.value })} /></label>
            <label>Por: R$<input value={draft.price} onChange={(event) => onDraftChange({ ...draft, price: event.target.value })} /></label>
            <label>Prioridade<input type="number" min={1} max={1000} value={draft.displayPriority} onChange={(event) => onDraftChange({ ...draft, displayPriority: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label>Status<select value={draft.status} onChange={(event) => onDraftChange({ ...draft, status: event.target.value as ComboOfferDraft["status"] })}>
              <option value="active">Ativo</option>
              <option value="paused">Inativo</option>
            </select></label>
            <label>
              Escopo
              <select value={draft.scopeType} onChange={(event) => onDraftChange({
                ...draft,
                scopeType: event.target.value as ComboOfferDraft["scopeType"],
                eventIds: event.target.value === "event" ? selectedEventIds : draft.eventIds,
                weekdays: event.target.value === "weekday" ? [draft.weekdays[0] ?? 5] : draft.weekdays,
              })}>
                <option value="all_events">Todos os eventos</option>
                <option value="event">Eventos especÃ­ficos</option>
                <option value="weekday">Dia da semana</option>
              </select>
            </label>
            {draft.scopeType === "event" ? (
              <div className="admin-event-field-wide admin-combo-event-picker">
                <label>
                  Adicionar evento
                  <select value="" onChange={(event) => addEvent(event.target.value)}>
                    <option value="">Escolha um evento</option>
                    {availableEvents.map((event) => (
                      <option key={event.eventId} value={event.eventId}>{event.title}</option>
                    ))}
                  </select>
                </label>
                <div className="admin-combo-event-list" aria-label="Eventos selecionados">
                  {selectedEventIds.length ? selectedEventIds.map((eventId) => (
                    <span key={eventId} className="admin-combo-event-item">
                      <span>{eventsById.get(eventId)?.title ?? "Evento removido"}</span>
                      <button type="button" onClick={() => removeEvent(eventId)} disabled={saving}>
                        Remover
                      </button>
                    </span>
                  )) : (
                    <span className="admin-combo-event-empty">Nenhum evento selecionado.</span>
                  )}
                </div>
              </div>
            ) : null}
            {draft.scopeType === "weekday" ? (
              <label>
                Dia
                <select value={draft.weekdays[0] ?? 5} onChange={(event) => onDraftChange({ ...draft, weekdays: [Number(event.target.value)] })}>
                  <option value={0}>Domingo</option>
                  <option value={1}>Segunda</option>
                  <option value={2}>Terça</option>
                  <option value={3}>Quarta</option>
                  <option value={4}>Quinta</option>
                  <option value={5}>Sexta</option>
                  <option value={6}>Sábado</option>
                </select>
              </label>
            ) : null}
            <label className={draft.timingType === "custom" ? "admin-combo-send-field" : ""}>
              Envio
              <span className="admin-combo-send-controls">
                <select value={draft.timingType} onChange={(event) => onDraftChange({ ...draft, timingType: event.target.value as ComboOfferTimingType })}>
                  <option value="custom">Após compra</option>
                  <option value="one_hour_before">1h antes do evento</option>
                  <option value="three_hours_before">3h antes do evento</option>
                  <option value="event_day_noon">Meio-dia do evento</option>
                </select>
                {draft.timingType === "custom" ? (
                  <span className="admin-combo-minutes-input">
                    <input type="number" min={1} max={10080} value={draft.customOffsetMinutes} onChange={(event) => onDraftChange({ ...draft, customOffsetMinutes: Math.max(1, Number(event.target.value) || 1) })} />
                    <span>min</span>
                  </span>
                ) : null}
              </span>
            </label>
            <label className="admin-event-field-wide">URL da foto<input value={draft.imageUrl} onChange={(event) => onDraftChange({ ...draft, imageUrl: event.target.value })} /></label>
            <label className="admin-event-field-wide">Descrição<textarea value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} /></label>
          </div>
        </div>

        <footer>
          <span>Pedidos já gerados continuam com os dados da compra original.</span>
          <button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar combo"}</button>
        </footer>
      </form>
    </div>
  );
}
