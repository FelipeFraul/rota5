"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import BrandLogo from "@/app/BrandLogo";
import type {
  OperationalDashboardData,
  OperationalDashboardPoint,
} from "@/lib/tickets/services/operationalDashboardTypes";
import { useOperationalDashboard } from "./useOperationalDashboard";

const EMPTY_VALUE = "—";
const COMPARISON_DAY_OPTIONS = [7, 15, 30, 60, 90] as const;

type Tone = "neutral" | "ok" | "attention" | "danger" | "info";
type ActiveMetric = "revenue" | "tickets" | "combos" | "whatsapp" | "alerts";
type IconName =
  | "activity"
  | "ticket"
  | "door"
  | "alert"
  | "message"
  | "bag"
  | "refresh"
  | "calendar"
  | "users"
  | "cash"
  | "spark";

type DetailItem = { label: string; value: string; tone?: Tone };
type FeedItem = { time?: string; title: string; detail?: string; value?: string; tone?: Tone };
type ChartLine = { label: string; values: number[]; dates?: string[] };
type ExpandedMetric = {
  title: string;
  icon: IconName;
  tone: Tone;
  headlineValue: string;
  headlineLabel: string;
  showChart: boolean;
  series: number[];
  eventSeries?: ChartLine[];
  summary: DetailItem[];
  sections: Array<{
    title: string;
    type?: "flow";
    items: FeedItem[];
  }>;
  insight: string;
};

function OperationIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    activity: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    ticket: <path d="M4 8a2 2 0 0 1 2-2h12v4a2 2 0 0 0 0 4v4H6a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4Z" />,
    door: <path d="M6 21V5a2 2 0 0 1 2-2h9v18M10 12h.01" />,
    alert: <path d="M12 3 2.8 19h18.4L12 3Zm0 6v4m0 4h.01" />,
    message: <path d="M21 12a8 8 0 0 1-8 8H5l-3 3v-8a8 8 0 1 1 19-3Z" />,
    bag: <path d="M6 8h12l-1 13H7L6 8Zm3 0a3 3 0 0 1 6 0" />,
    refresh: <path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.6 6.6M5.5 15a7 7 0 0 0 11.9 2.4" />,
    calendar: <path d="M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />,
    users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
    cash: <path d="M3 7h18v10H3V7Zm3 3h.01M18 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    spark: <path d="m12 3 1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3Zm6 12 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />,
  };

  return (
    <svg className="admin-operation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function formatNumber(value: unknown) {
  return typeof value === "number" ? new Intl.NumberFormat("pt-BR").format(value) : EMPTY_VALUE;
}

function formatCurrency(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100)
    : EMPTY_VALUE;
}

function formatPercent(value: unknown) {
  return typeof value === "number" ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%` : EMPTY_VALUE;
}

function formatTime(value: unknown) {
  if (typeof value !== "string") return EMPTY_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function getNumber(record: Record<string, number | null> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function hasSeriesData(values: number[]) {
  return values.some((value) => value > 0);
}

function toPolyline(values: number[], width: number, height: number) {
  if (values.length < 2 || !hasSeriesData(values)) return "";
  const max = Math.max(...values);
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - (max > 0 ? (value / max) * (height - 10) + 5 : height / 2),
  }));

  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      const previous = points[index - 1];
      const controlX = ((previous.x + point.x) / 2).toFixed(1);
      return `C ${controlX} ${previous.y.toFixed(1)}, ${controlX} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function formatChartValue(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function trimChartLines(lines: ChartLine[]) {
  const firstDataIndex = lines.reduce((firstIndex, line) => {
    const index = line.values.findIndex((value) => value > 0);
    return index >= 0 ? Math.min(firstIndex, index) : firstIndex;
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(firstDataIndex)) return [];

  return lines.map((line) => ({
    ...line,
    values: line.values.slice(firstDataIndex),
    dates: line.dates?.slice(firstDataIndex),
  }));
}

function getChartMarkers(values: number[], dates: string[] | undefined, label: string, width: number, height: number) {
  if (values.length < 2 || !hasSeriesData(values)) return [];
  const max = Math.max(...values);
  return values
    .map((value, index) => {
      const previous = values[index - 1] ?? 0;
      const next = values[index + 1] ?? 0;
      const isPeak = value > 0 && value >= previous && value >= next;
      if (!isPeak) return null;
      const x = (index / (values.length - 1)) * width;
      const y = height - (max > 0 ? (value / max) * (height - 10) + 5 : height / 2);
      const date = dates?.[index] ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(dates[index])) : "Período";
      return { x, y, title: `${label} • ${date} • ${formatChartValue(value)}` };
    })
    .filter((marker): marker is { x: number; y: number; title: string } => Boolean(marker));
}

function MiniChart({ values, lines }: { values: number[]; lines?: ChartLine[] }) {
  const chartLines = trimChartLines(lines?.length ? lines : [{ label: "Total", values }]);
  const renderedLines = chartLines
    .map((line) => ({
      ...line,
      points: toPolyline(line.values, 148, 76),
      markers: getChartMarkers(line.values, line.dates, line.label, 148, 76),
    }))
    .filter((line) => line.points);

  if (!renderedLines.length) return <span className="admin-operation-chart-empty">{EMPTY_VALUE}</span>;

  return (
    <svg className="admin-operation-metric-chart" viewBox="0 0 148 76" role="img" aria-label="Evolução por evento">
      {renderedLines.map((line, index) => (
        <g key={`${line.label}-${index}`}>
          <path d={line.points} />
          {line.markers.map((marker, markerIndex) => (
            <circle key={`${marker.title}-${markerIndex}`} cx={marker.x} cy={marker.y} r="4.5" tabIndex={0}>
              <title>{marker.title}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function MainChart({ values }: { values: number[] }) {
  const points = toPolyline(values, 620, 180);
  return (
    <div className="admin-operation-main-chart" aria-label="Gráfico do período">
      {points ? (
        <svg viewBox="0 0 620 180" aria-hidden="true" focusable="false">
          <polyline points={points} />
        </svg>
      ) : (
        <p>Nenhum dado no período.</p>
      )}
    </div>
  );
}

function mapDashboardToMetrics(data: OperationalDashboardData | null): Record<ActiveMetric, ExpandedMetric> {
  const revenueSummary = data?.revenue.summary;
  const ticketSummary = data?.tickets.summary;
  const comboSummary = data?.combos.summary;
  const whatsappSummary = data?.whatsapp.summary;
  const alertSummary = data?.alerts.summary;

  const revenueSeries = data?.revenue.series.map((point) => Number(point.totalRevenueCents ?? 0)) ?? [];
  const ticketSeries = data?.tickets.series.map((point) => Number(point.paidTickets ?? 0)) ?? [];
  const comboSeries = data?.combos.series.map((point) => Number(point.paidItems ?? 0)) ?? [];
  const whatsappSeries = data?.whatsapp.series.map((point) => Number(point.uniqueContacts ?? 0)) ?? [];
  const revenueEventSeries = data?.revenue.eventSeries?.map((series) => ({
    label: series.eventTitle,
    values: series.points.map((point) => Number(point.totalRevenueCents ?? 0)),
    dates: series.points.map((point) => String(point.date ?? "")),
  }));
  const ticketEventSeries = data?.tickets.eventSeries?.map((series) => ({
    label: series.eventTitle,
    values: series.points.map((point) => Number(point.paidTickets ?? 0)),
    dates: series.points.map((point) => String(point.date ?? "")),
  }));
  const comboEventSeries = data?.combos.eventSeries?.map((series) => ({
    label: series.eventTitle,
    values: series.points.map((point) => Number(point.paidItems ?? 0)),
    dates: series.points.map((point) => String(point.date ?? "")),
  }));
  const whatsappEventSeries = data?.whatsapp.eventSeries?.map((series) => ({
    label: series.eventTitle,
    values: series.points.map((point) => Number(point.uniqueContacts ?? 0)),
    dates: series.points.map((point) => String(point.date ?? "")),
  }));

  return {
    revenue: {
      title: "Receita",
      icon: "cash",
      tone: "ok",
      headlineValue: formatCurrency(getNumber(revenueSummary, "totalRevenueCents")),
      headlineLabel: "No período",
      showChart: true,
      series: revenueSeries,
      eventSeries: revenueEventSeries,
      summary: [
        { label: "Receita total", value: formatCurrency(getNumber(revenueSummary, "totalRevenueCents")), tone: "ok" },
        { label: "Receita de ingressos", value: formatCurrency(getNumber(revenueSummary, "ticketRevenueCents")) },
        { label: "Receita de combos", value: formatCurrency(getNumber(revenueSummary, "comboRevenueCents")), tone: "attention" },
        { label: "Pagamentos aprovados", value: formatNumber(getNumber(revenueSummary, "approvedPayments")) },
        { label: "Pagamentos pendentes", value: formatNumber(getNumber(revenueSummary, "pendingPayments")), tone: "attention" },
        { label: "Pagamentos recusados", value: formatNumber(getNumber(revenueSummary, "rejectedPayments")), tone: "danger" },
        { label: "Repasse", value: formatCurrency(getNumber(revenueSummary, "repasseCents")) },
      ],
      sections: [
        {
          title: "Últimas vendas",
          items: (data?.revenue.latestSales ?? []).map((sale) => ({
            time: formatTime(sale.time),
            title: String(sale.description ?? sale.type ?? "Venda"),
            detail: String(sale.paymentMethod ?? sale.status ?? ""),
            value: formatCurrency(typeof sale.valueCents === "number" ? sale.valueCents : null),
          })),
        },
        {
          title: "Distribuição",
          items: (data?.revenue.paymentMethods ?? []).map((method) => ({
            title: String(method.method ?? "Meio"),
            value: formatPercent(method.percentage),
          })),
        },
      ],
      insight: "A IA ainda não recebeu fatos deste módulo para interpretar.",
    },
    tickets: {
      title: "Ingressos",
      icon: "ticket",
      tone: "info",
      headlineValue: formatNumber(getNumber(ticketSummary, "soldPaid")),
      headlineLabel: "Vendidos",
      showChart: true,
      series: ticketSeries,
      eventSeries: ticketEventSeries,
      summary: [
        { label: "Vendidos", value: formatNumber(getNumber(ticketSummary, "soldPaid")), tone: "ok" },
        { label: "Disponíveis", value: formatNumber(getNumber(ticketSummary, "available")) },
        { label: "Cortesias", value: formatNumber(getNumber(ticketSummary, "courtesies")) },
        { label: "Cancelados", value: formatNumber(getNumber(ticketSummary, "cancelled")), tone: "attention" },
        { label: "Check-ins", value: formatNumber(getNumber(ticketSummary, "checkins")), tone: "ok" },
      ],
      sections: [
        {
          title: "Últimos emitidos",
          items: (data?.tickets.latestIssued ?? []).map((ticket) => ({
            time: formatTime(ticket.time),
            title: String(ticket.type ?? "Ingresso"),
            detail: String(ticket.buyerName ?? ticket.status ?? ""),
            value: typeof ticket.quantity === "number" ? `${ticket.quantity} ingresso` : EMPTY_VALUE,
          })),
        },
        {
          title: "Últimos check-ins",
          items: (data?.tickets.latestCheckins ?? []).map((checkin) => ({
            time: formatTime(checkin.time),
            title: String(checkin.gate ?? checkin.ticketCode ?? "Check-in"),
            detail: String(checkin.result ?? ""),
          })),
        },
        {
          title: "Problemas",
          items: [
            { title: "QR recusados", value: formatNumber(data?.tickets.problems.denied), tone: "danger" },
            { title: "QR já utilizados", value: formatNumber(data?.tickets.problems.alreadyUsed), tone: "attention" },
            { title: "QR não encontrados", value: formatNumber(data?.tickets.problems.notFound), tone: "danger" },
            { title: "Ingressos cancelados apresentados", value: formatNumber(data?.tickets.problems.cancelledPresented), tone: "attention" },
            { title: "Pedidos pagos sem ticket", value: formatNumber(data?.tickets.problems.paidOrdersWithoutTickets), tone: "danger" },
          ],
        },
      ],
      insight: "A IA ainda não recebeu fatos deste módulo para interpretar.",
    },
    combos: {
      title: "Combos",
      icon: "bag",
      tone: "attention",
      headlineValue: formatNumber(getNumber(comboSummary, "soldItems")),
      headlineLabel: "Vendidos",
      showChart: true,
      series: comboSeries,
      eventSeries: comboEventSeries,
      summary: [
        { label: "Vendidos", value: formatNumber(getNumber(comboSummary, "soldItems")), tone: "ok" },
        { label: "Pagos", value: formatNumber(getNumber(comboSummary, "paidOrders")), tone: "ok" },
        { label: "Utilizados", value: formatNumber(getNumber(comboSummary, "usedItems")) },
        { label: "Pendentes", value: formatNumber(getNumber(comboSummary, "pendingOrders")), tone: "attention" },
        { label: "Expirados", value: formatNumber(getNumber(comboSummary, "expiredOrders")), tone: "attention" },
        { label: "Receita", value: formatCurrency(getNumber(comboSummary, "revenueCents")) },
      ],
      sections: [
        {
          title: "Produtos mais vendidos",
          items: (data?.combos.topOffers ?? []).map((offer) => ({
            title: String(offer.name ?? "Combo"),
            detail: formatCurrency(typeof offer.revenueCents === "number" ? offer.revenueCents : null),
            value: formatNumber(offer.quantity),
          })),
        },
        {
          title: "Últimos combos",
          items: (data?.combos.latest ?? []).map((combo) => ({
            time: formatTime(combo.time),
            title: String(combo.offerName ?? "Combo"),
            detail: String(combo.status ?? ""),
          })),
        },
        {
          title: "Problemas",
          items: [
            { title: "Pagos sem QR", value: formatNumber(data?.combos.problems.paidWithoutQr), tone: "danger" },
            { title: "QR recusado", value: formatNumber(data?.combos.problems.qrDenied), tone: "danger" },
            { title: "Tentativa após uso", value: formatNumber(data?.combos.problems.alreadyUsed), tone: "attention" },
            { title: "Pendentes expirados", value: formatNumber(data?.combos.problems.expiredPending), tone: "attention" },
          ],
        },
      ],
      insight: "A IA ainda não recebeu fatos deste módulo para interpretar.",
    },
    whatsapp: {
      title: "WhatsApp",
      icon: "message",
      tone: "info",
      headlineValue: formatNumber(getNumber(whatsappSummary, "uniqueContacts")),
      headlineLabel: "Contatos",
      showChart: true,
      series: whatsappSeries,
      eventSeries: whatsappEventSeries,
      summary: [
        { label: "Contatos únicos", value: formatNumber(getNumber(whatsappSummary, "uniqueContacts")), tone: "ok" },
        { label: "Mensagens recebidas", value: formatNumber(getNumber(whatsappSummary, "inboundMessages")) },
        { label: "Mensagens enviadas", value: formatNumber(getNumber(whatsappSummary, "outboundMessages")) },
        { label: "Mensagens com falha", value: formatNumber(getNumber(whatsappSummary, "failedMessages")), tone: "danger" },
        { label: "Outbound pendente", value: formatNumber(getNumber(whatsappSummary, "pendingOutbound")), tone: "attention" },
        { label: "Batches em retry", value: formatNumber(getNumber(whatsappSummary, "batchesRetry")), tone: "attention" },
      ],
      sections: [
        {
          title: "Últimas atividades",
          items: (data?.whatsapp.latestActivity ?? []).map((activity) => ({
            time: formatTime(activity.time),
            title: String(activity.type ?? "Atividade"),
            detail: String(activity.status ?? ""),
          })),
        },
        {
          title: "Falhas",
          items: [
            { title: "Outbound falhado", value: formatNumber(data?.whatsapp.problems.failedOutbound), tone: "danger" },
            { title: "Batches em retry", value: formatNumber(data?.whatsapp.problems.retryBatches), tone: "attention" },
            { title: "Batch preso", value: formatNumber(data?.whatsapp.problems.stuckBatches), tone: "danger" },
            { title: "Delivery preso", value: formatNumber(data?.whatsapp.problems.stuckDeliveries), tone: "danger" },
          ],
        },
      ],
      insight: "A IA ainda não recebeu fatos deste módulo para interpretar.",
    },
    alerts: {
      title: "Alertas",
      icon: "alert",
      tone: "danger",
      headlineValue: formatNumber(alertSummary?.total),
      headlineLabel: alertSummary?.total ? "Ativos" : "Sem alertas",
      showChart: false,
      series: [],
      summary: [
        { label: "Críticos", value: formatNumber(alertSummary?.critical), tone: "danger" },
        { label: "Atenção", value: formatNumber(alertSummary?.warning), tone: "attention" },
        { label: "Informação", value: formatNumber(alertSummary?.info) },
        { label: "Última atualização", value: data?.generatedAt ? formatTime(data.generatedAt) : EMPTY_VALUE },
      ],
      sections: [
        {
          title: "Alertas ativos",
          items: (data?.alerts.items ?? []).map((alert) => ({
            time: formatTime(alert.detectedAt),
            title: alert.title,
            detail: alert.description,
            value: formatNumber(alert.quantity),
            tone: alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "attention" : "neutral",
          })),
        },
      ],
      insight: "A IA ainda não recebeu fatos deste módulo para interpretar.",
    },
  };
}

function MetricPill({
  metric,
  config,
  isActive,
  onClick,
}: {
  metric: ActiveMetric;
  config: ExpandedMetric;
  isActive: boolean;
  onClick: () => void;
}) {
  const className = `admin-operation-metric is-${config.tone}${isActive ? " is-active" : ""}`;

  return (
    <button type="button" className={className} onClick={onClick} aria-pressed={isActive}>
      <div className="admin-operation-metric-copy">
        <span>
          <OperationIcon name={config.icon} />
          {config.title}
        </span>
        <strong>{config.headlineValue}</strong>
        <small>{config.headlineLabel}</small>
        {metric === "alerts" ? (
          <span className="admin-operation-alert-badge">{config.headlineValue}</span>
        ) : (
          <MiniChart values={config.series} lines={config.eventSeries} />
        )}
      </div>
    </button>
  );
}

function ExpandedPanel({
  metric,
  comparisonDays,
  onComparisonDaysChange,
}: {
  metric: ExpandedMetric;
  comparisonDays: number;
  onComparisonDaysChange: (days: number) => void;
}) {
  return (
    <section className={`admin-operation-block admin-operation-expanded is-${metric.tone}`}>
      <header className="admin-operation-block-heading">
        <OperationIcon name={metric.icon} />
        <h2>{metric.title}</h2>
      </header>
      <div className="admin-operation-expanded-toolbar">
        <label>
          <span>Dias para comparativo</span>
          <select value={comparisonDays} onChange={(event) => onComparisonDaysChange(Number(event.target.value))}>
            {COMPARISON_DAY_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} dias
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="admin-operation-expanded-summary">
        {metric.summary.map((item) => (
          <SummaryMetric key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </div>
      {metric.showChart ? <MainChart values={metric.series} /> : null}
      <div className="admin-operation-expanded-columns">
        {metric.sections.map((section) => (
          <div key={section.title} className={`admin-operation-sublist${section.type === "flow" ? " is-flow" : ""}`}>
            <h3>{section.title}</h3>
            {section.items.length ? (
              section.items.map((item) => (
                <article key={`${item.time ?? ""}-${item.title}-${item.value ?? ""}`} className={`admin-operation-feed-row is-${item.tone ?? "neutral"}`}>
                  <time>{item.time ?? EMPTY_VALUE}</time>
                  <span>{item.title}</span>
                  {item.detail ? <small>{item.detail}</small> : null}
                  <strong>{item.value ?? EMPTY_VALUE}</strong>
                </article>
              ))
            ) : (
              <p className="admin-operation-empty">Nenhum dado carregado.</p>
            )}
          </div>
        ))}
      </div>
      <div className="admin-operation-insight">
        <h3>IA</h3>
        <p>{metric.insight}</p>
      </div>
    </section>
  );
}

function getSummaryIcon(label: string) {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("ingresso")) return "T";
  if (normalized.includes("combo")) return "C";
  if (normalized.includes("aprovado") || normalized.includes("check-in")) return "OK";
  if (normalized.includes("pendente")) return "!";
  if (normalized.includes("recusado") || normalized.includes("cancelado")) return "x";
  if (normalized.includes("repasse")) return "%";
  if (normalized.includes("dispon")) return "D";
  if (normalized.includes("cortesia")) return "G";
  if (normalized.includes("vendido")) return "V";
  return "R$";
}

function SummaryMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <article className={`admin-operation-summary-metric is-${tone}`} aria-label={`${label}: ${value}`}>
      <span className="admin-operation-summary-icon" title={label}>
        {getSummaryIcon(label)}
      </span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <article className={`admin-operation-row is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatEventOption(event: OperationalDashboardData["events"][number]) {
  const startsAt = event.startsAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.startsAt)) : null;
  return [event.title, event.artistName, startsAt, event.status].filter(Boolean).join(" • ");
}

export default function OperationalDashboardSection() {
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>("revenue");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [comparisonDays, setComparisonDays] = useState<number>(30);
  const { data, error, isLoading, isRefreshing, lastUpdatedAt, refresh } = useOperationalDashboard(selectedEventId, comparisonDays);
  const metrics = useMemo(() => mapDashboardToMetrics(data), [data]);
  const expandedMetric = metrics[activeMetric];
  const events = data?.events ?? [];
  const currentEventId = selectedEventId ?? "";

  return (
    <>
      <header className="admin-operation-hero">
        <BrandLogo />
        <div className="admin-operation-title">
          <p className="admin-events-kicker">Admin</p>
          <h1>Operação ao vivo</h1>
          <p>
            <span className="admin-operation-live-dot" />
            {error ? "Erro ao atualizar" : isRefreshing ? "Atualizando" : "Painel conectado"}
          </p>
        </div>
        <div className="admin-operation-top-actions">
          <span>{lastUpdatedAt ? `Atualizado: ${formatTime(lastUpdatedAt.toISOString())}` : "Aguardando dados"}</span>
          <Link className="admin-operation-link" href="/admin/eventos">
            Editar eventos
          </Link>
        </div>
        <div className="admin-operation-controls" aria-label="Controles da operação ao vivo">
          <label>
            <span>Evento</span>
            <select
              disabled={isLoading || events.length === 0}
              value={currentEventId}
              onChange={(event) => setSelectedEventId(event.target.value || null)}
            >
              {events.length ? (
                <>
                  <option value="">Todos</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {formatEventOption(event)}
                    </option>
                  ))}
                </>
              ) : (
                <option value="">Nenhum evento carregado</option>
              )}
            </select>
          </label>
          <button type="button" onClick={refresh} disabled={isRefreshing}>
            <OperationIcon name="refresh" />
            Atualizar
          </button>
        </div>
        {error ? <p className="admin-operation-error">{error}</p> : null}
      </header>

      <main className="admin-operation-layout" aria-label="Centro de inteligência operacional">
        <section className="admin-operation-metrics" aria-label="Resumo compacto">
          {(Object.keys(metrics) as ActiveMetric[]).map((metric) => (
            <MetricPill
              key={metric}
              metric={metric}
              config={metrics[metric]}
              isActive={activeMetric === metric}
              onClick={() => setActiveMetric(metric)}
            />
          ))}
        </section>

        <ExpandedPanel
          metric={expandedMetric}
          comparisonDays={comparisonDays}
          onComparisonDaysChange={setComparisonDays}
        />
      </main>
    </>
  );
}
