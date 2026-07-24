"use client";

import type { MouseEvent } from "react";
import type { ContactRange, DashboardState } from "../AdminEventsEditor";
import ContactActivitySection from "./ContactActivitySection";
import { DailyLineChart } from "./DashboardCharts";
import { formatCurrency, formatDateTime, formatInteger } from "./dashboardUtils";

type EventDashboardModalProps = {
  dashboard: DashboardState;
  rangeLoading: boolean;
  onClose: () => void;
  onOpenContacts: () => void;
  onRangeChange: (range: ContactRange) => void;
};

const generalRangeOptions: Array<[ContactRange, string]> = [
  ["day", "Dia"],
  ["week", "Semana"],
  ["30", "30 dias"],
  ["60", "60 dias"],
  ["total", "Total"],
];

function closeOnOverlayClick(event: MouseEvent<HTMLDivElement>, onClose: () => void) {
  if (event.target === event.currentTarget) onClose();
}

export default function EventDashboardModal({
  dashboard,
  rangeLoading,
  onClose,
  onOpenContacts,
  onRangeChange,
}: EventDashboardModalProps) {
  return (
    <div
      className="admin-event-modal admin-dashboard-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard do evento"
      onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
    >
      <section className="admin-dashboard-panel">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-events-kicker">Dashboard</p>
            <h2>{dashboard.event.title}</h2>
            <span>{dashboard.event.city}/{dashboard.event.state} · {formatDateTime(dashboard.event.nextSessionStartsAt)}</span>
          </div>
          <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar">&times;</button>
        </header>

        {dashboard.loading ? (
          <div className="admin-dashboard-skeleton" aria-label="Carregando dashboard">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {!dashboard.loading && dashboard.message ? (
          <p className="admin-dashboard-error">{dashboard.message}</p>
        ) : null}

        {!dashboard.loading && dashboard.data ? (() => {
          const data = dashboard.data;
          const occupancy = data.summary.capacity > 0
            ? Math.round((data.summary.soldTickets / data.summary.capacity) * 100)
            : 0;

          return (
            <div className="admin-dashboard-content">
              <div className="admin-contact-filters admin-dashboard-period-filters" role="tablist" aria-label="Período do dashboard do evento">
                {generalRangeOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={data.range === value ? "is-active" : ""}
                    disabled={rangeLoading}
                    onClick={() => onRangeChange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="admin-dashboard-kpis">
                <article>
                  <span>Vendas feitas</span>
                  <strong>{formatInteger(data.summary.soldTickets)} / {formatInteger(data.summary.capacity)}</strong>
                  <small>{occupancy}% do lote colocado à venda</small>
                </article>
                <article>
                  <span>Receita total</span>
                  <strong>{formatCurrency(data.summary.totalRevenueCents)}</strong>
                  <small>Ingressos {formatCurrency(data.summary.ticketRevenueCents)} · Combos {formatCurrency(data.summary.comboRevenueCents)}</small>
                </article>
                <article>
                  <span>Combos</span>
                  <strong>{formatInteger(data.summary.comboItemsSold)}</strong>
                  <small>{formatInteger(data.summary.comboUsed)} retirados · {formatInteger(data.summary.comboOrdersPending)} pendentes</small>
                </article>
                <article>
                  <span>Entrada</span>
                  <strong>{formatInteger(data.summary.checkins)}</strong>
                  <small>Check-ins realizados</small>
                </article>
                <article>
                  <span>Cortesias</span>
                  <strong>{formatInteger(data.summary.courtesyTickets)}</strong>
                  <small>Cortesias emitidas para este evento</small>
                </article>
              </div>

              <section className="admin-dashboard-chart-card">
                <div className="admin-dashboard-section-heading">
                  <div>
                    <h3>Gráfico diário de vendas</h3>
                    <p>Ingressos pagos e cortesias ao longo do dia. Combos entram na receita total e no resumo operacional.</p>
                  </div>
                </div>
                <DailyLineChart data={data} />
              </section>

              <ContactActivitySection activity={data.contactActivity} eventSpecific onOpen={onOpenContacts} />

              <div className="admin-dashboard-lower-grid">
                <section className="admin-dashboard-card">
                  <div className="admin-dashboard-section-heading">
                    <div>
                      <h3>Setores</h3>
                      <p>Vendido, reservado, bloqueado e disponível.</p>
                    </div>
                  </div>
                  <div className="admin-dashboard-section-list">
                    {data.sections.map((section) => (
                      <article key={section.sectionId}>
                        <div>
                          <strong>{section.name}</strong>
                          <span>{formatCurrency(section.revenueCents)}</span>
                        </div>
                        <div className="admin-dashboard-progress">
                          <span style={{ width: `${Math.min(section.occupancyPercent, 100)}%` }} />
                        </div>
                        <small>{formatInteger(section.sold)} vendidos · {formatInteger(section.capacity)} lote · {formatInteger(section.available)} livres</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="admin-dashboard-card">
                  <div className="admin-dashboard-section-heading">
                    <div>
                      <h3>Combos</h3>
                      <p>Produtos vendidos e retirada operacional.</p>
                    </div>
                  </div>
                  <div className="admin-dashboard-combo-summary">
                    <span>Pedidos pagos <strong>{formatInteger(data.summary.comboOrdersPaid)}</strong></span>
                    <span>Itens emitidos <strong>{formatInteger(data.summary.comboIssued)}</strong></span>
                    <span>Retirados <strong>{formatInteger(data.summary.comboUsed)}</strong></span>
                  </div>
                  <div className="admin-dashboard-combo-list">
                    {data.combos.offers.length ? data.combos.offers.map((offer) => (
                      <article key={offer.name}>
                        <span>{offer.name}</span>
                        <strong>{formatInteger(offer.quantity)} · {formatCurrency(offer.revenueCents)}</strong>
                      </article>
                    )) : <p className="admin-dashboard-empty">Nenhum combo pago para este evento.</p>}
                  </div>
                </section>
              </div>
            </div>
          );
        })() : null}
      </section>
    </div>
  );
}
