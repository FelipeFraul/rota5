"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type MouseEvent } from "react";
import type { EventDashboard, GeneralDashboard, GeneralDashboardPeriod, GeneralDashboardRange } from "../AdminEventsEditor";
import ContactActivitySection from "./ContactActivitySection";
import { GeneralSalesLineChart } from "./DashboardCharts";
import { formatCurrency, formatInteger, getGeneralRangeRows } from "./dashboardUtils";

const ContactsModal = dynamic(() => import("../contacts/ContactsModal"), {
  loading: () => null,
});

const generalRangeLabels: Record<GeneralDashboardRange, string> = {
  day: "Dia",
  week: "Semana",
  "30": "30 dias",
  "60": "60 dias",
  total: "Total",
};
const generalRangeOptions: Array<[GeneralDashboardRange, string]> = [
  ["day", generalRangeLabels.day],
  ["week", generalRangeLabels.week],
  ["30", generalRangeLabels["30"]],
  ["60", generalRangeLabels["60"]],
  ["total", generalRangeLabels.total],
];

function closeOnOverlayClick(event: MouseEvent<HTMLDivElement>, onClose: () => void) {
  if (event.target === event.currentTarget) onClose();
}

function GeneralSalesChartSummary({
  rows,
  periodLabel,
}: {
  rows: GeneralDashboardPeriod[];
  periodLabel: string;
}) {
  const purchases = rows.reduce((total, row) => total + row.ticketsSold, 0);
  const courtesies = rows.reduce((total, row) => total + row.courtesyTickets, 0);
  const peak = rows.reduce<GeneralDashboardPeriod | null>((current, row) => {
    if (!current) return row;
    const currentTotal = current.ticketsSold + current.courtesyTickets;
    const rowTotal = row.ticketsSold + row.courtesyTickets;
    return rowTotal > currentTotal ? row : current;
  }, null);
  const peakTotal = peak ? peak.ticketsSold + peak.courtesyTickets : 0;

  return (
    <div className="admin-contact-summary admin-sales-chart-summary">
      <span><strong>{formatInteger(purchases)}</strong> compras · {periodLabel}</span>
      <span><strong>{formatInteger(courtesies)}</strong> cortesias emitidas</span>
      <span><strong>{peakTotal > 0 && peak ? `${peak.intervalLabel ?? peak.label} (${formatInteger(peakTotal)})` : "—"}</strong> maior incidência</span>
    </div>
  );
}

export default function GeneralDashboardModal({
  dashboard,
  contactActivityByRange,
  contactsLoadingRange,
  onLoadContacts,
  onClose,
}: {
  dashboard: GeneralDashboard;
  contactActivityByRange: Partial<Record<GeneralDashboardRange, EventDashboard["contactActivity"]>>;
  contactsLoadingRange: GeneralDashboardRange | null;
  onLoadContacts: (range: GeneralDashboardRange) => void;
  onClose: () => void;
}) {
  const [range, setRange] = useState<GeneralDashboardRange>("day");
  const [contactsOpen, setContactsOpen] = useState(false);
  const { rows, summary } = getGeneralRangeRows(dashboard, range);
  const contactActivity = contactActivityByRange[range] ?? dashboard.contactActivity;
  const contactsLoading = contactsLoadingRange === range;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (contactsOpen) return;
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contactsOpen, onClose]);

  return (
    <div
      className="admin-event-modal admin-dashboard-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Geral de todos os eventos"
      onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
    >
      <section className="admin-dashboard-panel admin-general-panel">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-events-kicker">Todos os eventos</p>
            <h2>Geral de vendas</h2>
            <span>Compras e cortesias consolidadas por período.</span>
          </div>
          <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar">&times;</button>
        </header>
        <div className="admin-dashboard-content">
          <div className="admin-general-controls">
            <div className="admin-general-filter-group" role="tablist" aria-label="Filtro do gráfico geral">
              {generalRangeOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={range === value ? "is-active" : ""}
                  onClick={() => {
                    if (value === range) return;
                    setRange(value);
                    onLoadContacts(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="admin-general-repasse-mini">
              <span>Repasse 5%</span>
              <strong>{formatCurrency(summary.repasseCents)}</strong>
              <small>{summary.label}</small>
            </div>
          </div>
          <section className="admin-dashboard-chart-card admin-general-chart-card">
            <div className="admin-dashboard-section-heading">
              <div>
                <h3>Vendas no período</h3>
                <p>Quantidade de compras e cortesias em cada intervalo.</p>
              </div>
            </div>
            <GeneralSalesChartSummary rows={rows} periodLabel={summary.label} />
            <GeneralSalesLineChart rows={rows} />
          </section>
          <div className="admin-general-summary-grid">
            <article>
              <span>Receita</span>
              <strong>{formatCurrency(summary.totalRevenueCents)}</strong>
              <small>Ingressos {formatCurrency(summary.ticketRevenueCents)} · Combos {formatCurrency(summary.comboRevenueCents)}</small>
            </article>
            <article>
              <span>Ingressos</span>
              <strong>{formatInteger(summary.ticketsSold)}</strong>
              <small>Ingressos pagos no período</small>
            </article>
            <article>
              <span>Combos</span>
              <strong>{formatInteger(summary.comboItemsSold)}</strong>
              <small>{formatInteger(summary.comboUsed)} retirados · {formatInteger(summary.comboOrdersPending)} pendentes</small>
            </article>
            <article>
              <span>Entrada</span>
              <strong>{formatInteger(summary.checkins)}</strong>
              <small>Check-ins no período</small>
            </article>
            <article>
              <span>Cortesias</span>
              <strong>{formatInteger(summary.courtesyTickets)}</strong>
              <small>Cortesias emitidas no período</small>
            </article>
          </div>
          <ContactActivitySection
            activity={contactActivity}
            loading={contactsLoading}
            onOpen={() => {
              onLoadContacts(range);
              setContactsOpen(true);
            }}
          />
        </div>
      </section>
      {contactsOpen ? (
        <ContactsModal
          activity={contactActivityByRange[range] ?? { ...contactActivity, contacts: [] }}
          title="Contatos gerais"
          onClose={() => setContactsOpen(false)}
        />
      ) : null}
    </div>
  );
}
