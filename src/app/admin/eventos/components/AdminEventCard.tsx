"use client";

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import type { EventStatus } from "../AdminEventsEditor";

export type AdminEventCardProps = {
  eventId: string;
  title: string;
  city: string;
  state: string;
  displayStatus: EventStatus;
  imageUrl: string | null;
  nextSessionStartsAt: string | null;
  ticketImpressions: number;
  ticketClicks: number;
  ticketItemsSold: number;
  ticketRevenueCents: number;
  duplicating: boolean;
  onOpen: (eventId: string) => void;
  onDuplicate: (eventId: string) => void;
  onOpenDashboard: (eventId: string) => void;
  onDelete: (eventId: string) => void;
};

const statusLabels: Record<EventStatus, string> = {
  draft: "Pausado",
  published: "Publicado",
  cancelled: "Cancelado",
  finished: "Finalizado",
};

function formatDateTime(value: string | null) {
  if (!value) return "Sem data";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20h4.7L19.4 9.3a2.1 2.1 0 0 0 0-3L17.7 4.6a2.1 2.1 0 0 0-3 0L4 15.3V20Z" />
      <path d="m13.5 5.8 4.7 4.7" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="11" width="3" height="5" rx="1" />
      <rect x="12" y="7" width="3" height="9" rx="1" />
      <rect x="17" y="9" width="3" height="7" rx="1" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M18 6v14H6V6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}
function stopCardPropagation(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

function AdminEventCardComponent({
  eventId,
  title,
  city,
  state,
  displayStatus,
  imageUrl,
  nextSessionStartsAt,
  ticketImpressions,
  ticketClicks,
  ticketItemsSold,
  ticketRevenueCents,
  duplicating,
  onOpen,
  onDuplicate,
  onOpenDashboard,
  onDelete,
}: AdminEventCardProps) {
  const open = () => onOpen(eventId);
  const duplicate = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardPropagation(event);
    onDuplicate(eventId);
  };
  const openDashboard = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardPropagation(event);
    onOpenDashboard(eventId);
  };
  const deleteEvent = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardPropagation(event);
    onDelete(eventId);
  };
  const edit = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardPropagation(event);
    onOpen(eventId);
  };
  const handleKeyDown = (keyboardEvent: KeyboardEvent<HTMLElement>) => {
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      onOpen(eventId);
    }
  };

  return (
    <article
      className="admin-event-card"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {imageUrl ? <img src={imageUrl} alt="" /> : <span className="admin-event-card-image" />}
      <span className="admin-event-card-body">
        <span className="admin-event-card-actions">
          <span className={`admin-event-status is-${displayStatus}`}>{statusLabels[displayStatus]}</span>
          <button
            type="button"
            className="admin-event-action-button"
            aria-label={`Editar ${title}`}
            data-tooltip="Editar"
            onClick={edit}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="admin-event-action-button"
            aria-label={`Duplicar ${title}`}
            data-tooltip="Duplicar"
            disabled={duplicating}
            onClick={duplicate}
          >
            <DuplicateIcon />
          </button>
          <button
            type="button"
            className="admin-event-action-button"
            aria-label={`Dashboard de ${title}`}
            data-tooltip="Dashboard"
            onClick={openDashboard}
          >
            <ChartIcon />
          </button>
          <button
            type="button"
            className="admin-event-action-button is-danger"
            aria-label={`Excluir ${title}`}
            data-tooltip="Excluir"
            onClick={deleteEvent}
          >
            <DeleteIcon />
          </button>
        </span>
        <strong>{title}</strong>
        <small>{city}/{state} · {formatDateTime(nextSessionStartsAt)}</small>
        <span className="admin-card-funnel-metrics">
          <span><b>{formatInteger(ticketItemsSold)}</b> vendidos</span>
          <span><b>{formatCurrency(ticketRevenueCents)}</b> receita</span>
        </span>
        <span className="admin-card-funnel-metrics">
          <span><b>{formatInteger(ticketImpressions)}</b> impressões</span>
          <span><b>{formatInteger(ticketClicks)}</b> cliques</span>
        </span>
      </span>
    </article>
  );
}

const AdminEventCard = memo(AdminEventCardComponent);

export default AdminEventCard;

