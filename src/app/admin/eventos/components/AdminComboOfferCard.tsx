"use client";

import { memo } from "react";

export type AdminComboOfferCardProps = {
  offerId: string;
  name: string;
  imageUrl: string | null;
  priceCents: number;
  displayPriority: number;
  status: "active" | "paused" | string;
  timingLabel: string;
  scopeLabel: string;
  itemsSold: number;
  revenueCents: number;
  impressions: number;
  clicks: number;
  actionPending: boolean;
  onEdit: (offerId: string) => void;
  onDuplicate: (offerId: string) => void;
  onDelete: (offerId: string) => void;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
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

function AdminComboOfferCardComponent({
  offerId,
  name,
  imageUrl,
  priceCents,
  displayPriority,
  status,
  timingLabel,
  scopeLabel,
  itemsSold,
  revenueCents,
  impressions,
  clicks,
  actionPending,
  onEdit,
  onDuplicate,
  onDelete,
}: AdminComboOfferCardProps) {
  return (
    <article className="admin-event-card admin-combo-offer-card">
      <span
        className="admin-event-card-image admin-combo-offer-image"
        style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
      />
      <span className="admin-event-card-body">
        <span className="admin-event-card-actions">
          <span className={`admin-event-status is-${status === "active" ? "published" : "draft"}`}>
            {status === "active" ? "Ativo" : "Inativo"}
          </span>
          <button
            type="button"
            className="admin-event-action-button"
            aria-label={`Editar combo ${name}`}
            data-tooltip="Editar"
            onClick={() => onEdit(offerId)}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="admin-event-action-button"
            aria-label={`Duplicar combo ${name}`}
            data-tooltip="Duplicar"
            disabled={actionPending}
            onClick={() => onDuplicate(offerId)}
          >
            <DuplicateIcon />
          </button>
          <button
            type="button"
            className="admin-event-action-button"
            aria-label={`Dashboard do combo ${name}`}
            data-tooltip="Dashboard"
            disabled
          >
            <ChartIcon />
          </button>
          <button
            type="button"
            className="admin-event-action-button is-danger"
            aria-label={`Excluir combo ${name}`}
            data-tooltip="Excluir"
            disabled={actionPending}
            onClick={() => onDelete(offerId)}
          >
            <DeleteIcon />
          </button>
        </span>
        <strong>{name}</strong>
        <small>Prioridade {formatInteger(displayPriority || 1)}</small>
        <small>{formatCurrency(priceCents)} · {timingLabel}</small>
        <small>{scopeLabel}</small>
        <span className="admin-combo-offer-metrics">
          <span><b>{formatInteger(itemsSold)}</b> vendidos</span>
          <span><b>{formatCurrency(revenueCents)}</b> receita</span>
          <span><b>{formatInteger(impressions)}</b> impressões</span>
          <span><b>{formatInteger(clicks)}</b> cliques em oferta</span>
        </span>
      </span>
    </article>
  );
}

const AdminComboOfferCard = memo(AdminComboOfferCardComponent);

export default AdminComboOfferCard;
