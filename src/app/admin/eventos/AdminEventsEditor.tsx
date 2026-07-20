"use client";

import { FormEvent, type MouseEvent, useCallback, useEffect, useState } from "react";
import BrandLogo from "@/app/BrandLogo";

type ActiveTab = "event" | "sessions" | "sections" | "prices" | "courtesy";

type EventSummary = {
  eventId: string;
  title: string;
  artistName: string;
  city: string;
  state: string;
  status: EventStatus;
  displayStatus: EventStatus;
  imageUrl: string | null;
  venueName: string | null;
  sessionsCount: number;
  nextSessionStartsAt: string | null;
  nextSessionStatus: string | null;
  ticketSalesOverview: Array<{
    key: string;
    label: string;
    shortLabel: string;
    sold: number;
    available: number;
    courtesySold?: number;
    courtesyAvailable?: number;
    salesSold?: number;
    salesAvailable?: number;
  }>;
};

type EventStatus = "draft" | "published" | "cancelled" | "finished";
type EventFilterStatus = EventStatus | "all" | "paused";
type SessionStatus = "scheduled" | "sales_open" | "sales_closed" | "cancelled" | "finished";
type SectionStatus = "active" | "inactive";
type PriceStatus = "active" | "inactive";

type ContactActivityContact = EventDashboard["contactActivity"]["contacts"][number];

type EventDetails = EventSummary & {
  description: string | null;
  venueId: string | null;
  createdAt: string;
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    status: SessionStatus;
    venueId: string | null;
    venueName: string | null;
  }>;
  sections: Array<{
    sectionId: string;
    name: string;
    slug: string;
    capacity: number | null;
    hasNumberedSeats: boolean;
    status: SectionStatus;
  }>;
  prices: Array<{
    priceId: string;
    sessionId: string;
    sectionId: string | null;
    sectionName: string | null;
    ticketType: string;
    label: string;
    priceCents: number;
    feeCents: number;
    currency: string;
    salesStartAt: string | null;
    salesEndAt: string | null;
    status: PriceStatus;
  }>;
  courtesy: {
    sections: Array<{
      sectionId: string;
      sectionName: string;
      label: string;
      limit: number;
      status: SectionStatus;
    }>;
  };
};

type Draft = {
  event: {
    title: string;
    artistName: string;
    city: string;
    state: string;
    venueName: string;
    description: string;
    imageUrl: string;
    status: EventStatus;
  };
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    status: SessionStatus;
  }>;
  sections: Array<{
    sectionId: string;
    name: string;
    capacity: number | null;
    status: SectionStatus;
  }>;
  newSections: Array<{
    clientId: string;
    name: string;
    capacity: number;
  }>;
  prices: Array<{
    priceId: string;
    sectionId: string | null;
    sectionName: string | null;
    label: string;
    price: string;
    fee: string;
    salesStartAt: string | null;
    salesEndAt: string | null;
    status: PriceStatus;
  }>;
  courtesy: {
    sections: Array<{
      sectionId: string;
      sectionName: string;
      label: string;
      limit: number;
      status: SectionStatus;
    }>;
  };
};

type EventDashboard = {
  range: ContactRange;
  summary: {
    soldTickets: number;
    capacity: number;
    available: number;
    reserved: number;
    blocked: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    comboRevenueCents: number;
    totalRevenueCents: number;
    checkins: number;
    usedTickets: number;
    comboOrdersPaid: number;
    comboOrdersPending: number;
    comboItemsSold: number;
    comboIssued: number;
    comboUsed: number;
  };
  sections: Array<{
    sectionId: string;
    name: string;
    capacity: number;
    sold: number;
    reserved: number;
    blocked: number;
    available: number;
    revenueCents: number;
    occupancyPercent: number;
  }>;
  dailySales: Array<{
    key: string;
    label: string;
    ticketsSold: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    comboRevenueCents: number;
    sections: Array<{
      sectionId: string;
      sectionName: string;
      quantity: number;
      revenueCents: number;
    }>;
  }>;
  sixHourSales: Array<{
    dayKey: string;
    endHour: number;
    ticketsSold: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    sections: Array<{
      sectionId: string;
      sectionName: string;
      quantity: number;
      revenueCents: number;
    }>;
  }>;
  contactActivity: {
    range: ContactRange;
    periodLabel: string;
    dayKey: string;
    totalUniqueContacts: number;
    totalMessages: number;
    peakEndHour: number | null;
    peakUniqueContacts: number;
    intervals: Array<{
      endHour: number;
      uniqueContacts: number;
      messagesReceived: number;
    }>;
    points: Array<{
      key: string;
      label: string;
      intervalLabel?: string;
      positionHour?: number;
      uniqueContacts: number;
      messagesReceived: number;
    }>;
    peakLabel: string | null;
    contacts: Array<{
      customerId: string;
      name: string | null;
      phone: string;
      messageCount: number;
      firstContactAt: string;
      lastContactAt: string;
      purchasedTicket: boolean;
      stoppedAtState: string;
      stoppedAtLabel: string;
      lastInboundMessage: string | null;
      lastOutboundMessage: string | null;
      conversationMessages: Array<{
        direction: "inbound" | "outbound";
        body: string;
        createdAt: string;
      }>;
      purchasedEvents: Array<{
        sessionId: string;
        name: string;
        startsAt: string;
      }>;
    }>;
  };
  combos: {
    offers: Array<{
      name: string;
      quantity: number;
      revenueCents: number;
    }>;
  };
};

type DashboardState = {
  event: EventSummary;
  data: EventDashboard | null;
  loading: boolean;
  message: string | null;
};

type GeneralDashboardPeriod = {
  key: string;
  label: string;
  intervalLabel?: string;
  positionHour?: number;
  ticketsSold: number;
  capacity: number;
  ticketRevenueCents: number;
  comboRevenueCents: number;
  totalRevenueCents: number;
  comboItemsSold: number;
  comboUsed: number;
  comboOrdersPending: number;
  checkins: number;
  courtesyTickets: number;
  repasseCents: number;
};

type GeneralDashboard = {
  today: GeneralDashboardPeriod;
  fridayWindow: GeneralDashboardPeriod;
  sixHour: GeneralDashboardPeriod[];
  daily: GeneralDashboardPeriod[];
  weekly: GeneralDashboardPeriod[];
  monthly: GeneralDashboardPeriod[];
  contactActivity: EventDashboard["contactActivity"];
};

type GeneralDashboardRange = "day" | "week" | "30" | "60" | "total";
type ContactRange = GeneralDashboardRange;

const statusLabels: Record<EventStatus | SessionStatus | SectionStatus | PriceStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  draft: "Pausado",
  published: "Publicado",
  cancelled: "Cancelado",
  finished: "Finalizado",
  scheduled: "Agendado",
  sales_open: "Venda aberta",
  sales_closed: "Venda fechada",
};

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("admin_web_csrf="))
    ?.split("=")[1] ?? "";
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem data";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function dateFromDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatDayLabel(key: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateFromDayKey(key)).replace(".", "");
}

const SIX_HOUR_BOUNDARIES = [0, 6, 12, 18, 24] as const;

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}h`;
}

function getSixHourIntervalLabelFromStart(startHour: number) {
  return `${formatHour(startHour)}–${formatHour(startHour + 6)}`;
}

function buildDailyLineData(data: EventDashboard) {
  if (data.range === "day") {
    const day = data.dailySales[0] ?? {
      key: data.contactActivity.dayKey,
      label: formatDayLabel(data.contactActivity.dayKey),
      ticketsSold: 0,
      courtesyTickets: 0,
      ticketRevenueCents: 0,
      comboRevenueCents: 0,
      sections: [],
    };
    const intervals = new Map(
      (data.sixHourSales ?? [])
        .filter((interval) => interval.dayKey === day.key)
        .map((interval) => [interval.endHour, interval]),
    );
    return SIX_HOUR_BOUNDARIES.slice(0, -1).map((hour) => {
      const interval = intervals.get(hour + 6);

      return {
        key: `${day.key}-${String(hour).padStart(2, "0")}`,
        label: `${String(hour).padStart(2, "0")}h`,
        total: interval?.ticketsSold ?? 0,
        courtesy: interval?.courtesyTickets ?? 0,
        revenueCents: interval?.ticketRevenueCents ?? 0,
        sections: new Map(
          interval?.sections.map((section) => [
            section.sectionId,
            { quantity: section.quantity, revenueCents: section.revenueCents },
          ]) ?? [],
        ),
      };
    });
  }

  const byKey = new Map(data.dailySales.map((day) => [day.key, day]));
  const todayKey = data.contactActivity.dayKey;
  const dayCount = data.range === "week" ? 7 : data.range === "30" ? 30 : data.range === "60" ? 60 : null;
  const candidateKeys = [
    ...byKey.keys(),
    ...data.contactActivity.points.map((point) => point.key).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)),
  ].sort();
  const start = dayCount
    ? addDays(dateFromDayKey(todayKey), -(dayCount - 1))
    : dateFromDayKey(candidateKeys[0] ?? todayKey);
  const end = dateFromDayKey(todayKey);
  const rows: Array<{
    key: string;
    label: string;
    total: number;
    courtesy: number;
    revenueCents: number;
    sections: Map<string, { quantity: number; revenueCents: number }>;
  }> = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = dayKeyFromDate(cursor);
    const source = byKey.get(key);
    rows.push({
      key,
      label: formatDayLabel(key),
      total: source?.ticketsSold ?? 0,
      courtesy: source?.courtesyTickets ?? 0,
      revenueCents: source?.ticketRevenueCents ?? 0,
      sections: new Map(
        source?.sections.map((section) => [
          section.sectionId,
          { quantity: section.quantity, revenueCents: section.revenueCents },
        ]) ?? [],
      ),
    });
  }

  return rows;
}

function buildSmoothLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

type ChartHover = {
  x: number;
  y: number;
  label: string;
  name: string;
  value: number;
  revenueCents: number;
  color: string;
};

function DailyLineChart({ data }: { data: EventDashboard }) {
  const [hover, setHover] = useState<ChartHover | null>(null);
  const rows = buildDailyLineData(data);
  const width = 960;
  const height = 150;
  const padding = { top: 16, right: 28, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...rows.map((row) => row.total),
    ...rows.map((row) => row.courtesy),
  );
  const yTicks = [maxValue, Math.round(maxValue * 0.5), 0]
    .filter((value, index, values) => values.indexOf(value) === index);
  const xForIndex = (index: number) => padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const xForHour = (hour: number) => padding.left + (hour / 24) * chartWidth;
  const xForRow = (row: (typeof rows)[number], index: number) => data.range === "day"
    ? xForHour(Number(row.label.replace("h", "")) + 3)
    : xForIndex(index);
  const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const totalPoints = rows.map((row, index) => ({
    x: xForRow(row, index),
    y: yForValue(row.total),
    value: row.total,
    revenueCents: row.revenueCents,
    label: data.range === "day"
      ? getSixHourIntervalLabelFromStart(Number(row.label.replace("h", "")))
      : row.label,
  }));
  const totalPath = buildSmoothLinePath(totalPoints);
  const courtesyPoints = rows.map((row, index) => ({
    x: xForRow(row, index),
    y: yForValue(row.courtesy),
    value: row.courtesy,
    revenueCents: 0,
    label: data.range === "day"
      ? getSixHourIntervalLabelFromStart(Number(row.label.replace("h", "")))
      : row.label,
  }));
  const courtesyPath = buildSmoothLinePath(courtesyPoints);
  const labelStep = Math.max(1, Math.ceil(rows.length / 9));

  return (
    <div className="admin-dashboard-line-chart" onMouseLeave={() => setHover(null)}>
      <div className="admin-dashboard-line-legend">
        <span><i style={{ background: "#16a34a" }} />Compras</span>
        <span><i style={{ background: "#3b82f6" }} />Cortesias</span>
      </div>
      <div className="admin-dashboard-chart-plot">
      {hover ? (
        <div
          className="admin-dashboard-line-tooltip"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${(hover.y / height) * 100}%`,
            borderColor: hover.color,
          }}
        >
          <span>{hover.label}</span>
          <strong style={{ color: hover.color }}>{hover.name}: {formatInteger(hover.value)}</strong>
          {hover.revenueCents > 0 ? <em>{formatCurrency(hover.revenueCents)}</em> : null}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico diário de linhas por setor">
        <defs>
          <linearGradient id="admin-dashboard-total-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity="0.34" />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = yForValue(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="admin-dashboard-grid-line" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="admin-dashboard-axis-label">{formatInteger(tick)}</text>
            </g>
          );
        })}
        {totalPath ? <path d={totalPath} className="admin-dashboard-section-line" style={{ stroke: "#16a34a" }} /> : null}
        {totalPoints.map((point) => point.value > 0 ? (
          <circle
            key={`total-${point.label}`}
            cx={point.x}
            cy={point.y}
            r="9"
            className="admin-dashboard-line-hit"
            onMouseEnter={() => setHover({
              x: point.x,
              y: point.y,
              label: point.label,
              name: "Compras",
              value: point.value,
              revenueCents: point.revenueCents,
              color: "#16a34a",
            })}
          />
        ) : null)}
        {courtesyPath ? (
          <path
            d={courtesyPath}
            className="admin-dashboard-section-line"
            style={{ stroke: "#3b82f6" }}
          />
        ) : null}
        {courtesyPoints.map((point) => point.value > 0 ? (
          <circle
            key={`courtesy-${point.label}`}
            cx={point.x}
            cy={point.y}
            r="5"
            className="admin-dashboard-line-point"
            style={{ fill: "#3b82f6" }}
            onMouseEnter={() => setHover({
              x: point.x,
              y: point.y,
              label: point.label,
              name: "Cortesias",
              value: point.value,
              revenueCents: 0,
              color: "#3b82f6",
            })}
          />
        ) : null)}
        {data.range === "day"
          ? SIX_HOUR_BOUNDARIES.map((hour) => (
              <text key={hour} x={xForHour(hour)} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{formatHour(hour)}</text>
            ))
          : rows.map((row, index) => index % labelStep === 0 || index === rows.length - 1 ? (
              <text key={row.key} x={xForIndex(index)} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{row.label}</text>
            ) : null)}
      </svg>
      </div>
    </div>
  );
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

function formatContactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${digits}`;
}

function formatContactDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function ContactActivityChart({ activity }: { activity: EventDashboard["contactActivity"] }) {
  const [hover, setHover] = useState<(typeof activity.points)[number] | null>(null);
  const rows = activity.points;
  const width = 960;
  const height = 130;
  const padding = { top: 14, right: 28, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [row.uniqueContacts, row.messagesReceived]),
  );
  const xForIndex = (index: number) => padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const xForHour = (hour: number) => padding.left + (hour / 24) * chartWidth;
  const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const points = rows.map((row, index) => ({
    ...row,
    x: activity.range === "day" && row.positionHour !== undefined
      ? xForHour(row.positionHour)
      : xForIndex(index),
    uniqueY: yForValue(row.uniqueContacts),
    messagesY: yForValue(row.messagesReceived),
  }));
  const uniquePath = buildSmoothLinePath(points.map((point) => ({ x: point.x, y: point.uniqueY })));
  const messagesPath = buildSmoothLinePath(points.map((point) => ({ x: point.x, y: point.messagesY })));
  const activePoint = hover ? points.find((point) => point.key === hover.key) : null;

  return (
    <div className="admin-contact-chart" onMouseLeave={() => setHover(null)}>
      <div className="admin-dashboard-line-legend">
        <span><i style={{ background: "#7c3aed" }} />Pessoas únicas</span>
        <span><i style={{ background: "#0f766e" }} />Mensagens recebidas</span>
      </div>
      <div className="admin-dashboard-chart-plot">
      {hover && activePoint ? (
        <div
          className="admin-dashboard-line-tooltip"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(Math.min(activePoint.uniqueY, activePoint.messagesY) / height) * 100}%`,
            borderColor: "#7c3aed",
          }}
        >
          <span>{hover.intervalLabel ?? hover.label}</span>
          <strong style={{ color: "#7c3aed" }}>
            {formatInteger(hover.uniqueContacts)} {hover.uniqueContacts === 1 ? "pessoa única" : "pessoas únicas"}
          </strong>
          <em>{formatInteger(hover.messagesReceived)} {hover.messagesReceived === 1 ? "mensagem recebida" : "mensagens recebidas"}</em>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Pessoas que enviaram mensagem ao WhatsApp em ${activity.periodLabel.toLowerCase()}, em intervalos de seis horas`}>
        {[maxValue, 0].map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yForValue(tick)} y2={yForValue(tick)} className="admin-dashboard-grid-line" />
            <text x={padding.left - 14} y={yForValue(tick) + 4} textAnchor="end" className="admin-dashboard-axis-label">{tick}</text>
          </g>
        ))}
        <path d={uniquePath} className="admin-dashboard-section-line" style={{ stroke: "#7c3aed" }} />
        <path d={messagesPath} className="admin-dashboard-section-line" style={{ stroke: "#0f766e" }} />
        {points.map((point) => (
          <circle
            key={`hit-${point.key}`}
            cx={point.x}
            cy={Math.min(point.uniqueY, point.messagesY)}
            r="9"
            className="admin-dashboard-line-hit"
            onMouseEnter={() => setHover(activity.points.find((row) => row.key === point.key) ?? null)}
          />
        ))}
        {points.map((point) => (
          <circle
            key={`unique-${point.key}`}
            cx={point.x}
            cy={point.uniqueY}
            r="5"
            className="admin-dashboard-line-point"
            style={{ fill: "#7c3aed", pointerEvents: "none" }}
          />
        ))}
        {points.map((point) => (
          <circle
            key={`messages-${point.key}`}
            cx={point.x}
            cy={point.messagesY}
            r="5"
            className="admin-dashboard-line-point"
            style={{ fill: "#0f766e", pointerEvents: "none" }}
          />
        ))}
        {activity.range === "day"
          ? SIX_HOUR_BOUNDARIES.map((hour) => (
              <text key={`label-${hour}`} x={xForHour(hour)} y={height - 12} textAnchor="middle" className="admin-dashboard-axis-label">{formatHour(hour)}</text>
            ))
          : points.map((point, index) => index % Math.max(1, Math.ceil(points.length / 9)) === 0 || index === points.length - 1 ? (
              <text key={`label-${point.key}`} x={point.x} y={height - 12} textAnchor="middle" className="admin-dashboard-axis-label">{point.label}</text>
            ) : null)}
      </svg>
      </div>
    </div>
  );
}

function ContactActivitySection({
  activity,
  eventSpecific = false,
  loading = false,
  onOpen,
}: {
  activity: EventDashboard["contactActivity"];
  eventSpecific?: boolean;
  loading?: boolean;
  onOpen: () => void;
}) {
  return (
    <section className="admin-dashboard-chart-card">
      <div className="admin-dashboard-section-heading">
        <div>
          <h3>Contatos no WhatsApp</h3>
          <p>{eventSpecific
            ? "Pessoas que conversaram na jornada deste show e concluíram a compra, em intervalos de 6 horas."
            : `Todas as pessoas que mandaram mensagem em ${activity.periodLabel.toLowerCase()}, em intervalos de 6 horas.`}</p>
        </div>
        <button type="button" className="admin-dashboard-contact-button" onClick={onOpen}>Ver contatos</button>
      </div>
      <div className="admin-contact-summary">
        <span><strong>{formatInteger(activity.totalUniqueContacts)}</strong> pessoas · {activity.periodLabel}</span>
        <span><strong>{formatInteger(activity.totalMessages)}</strong> mensagens recebidas</span>
        <span><strong>{activity.peakLabel
          ? `${activity.peakLabel} (${formatInteger(activity.peakUniqueContacts)})`
          : "—"}</strong> maior incidência</span>
      </div>
      {loading
        ? <p className="admin-dashboard-empty">Atualizando contatos...</p>
        : <ContactActivityChart activity={activity} />}
    </section>
  );
}

function closeOnOverlayClick(
  event: MouseEvent<HTMLDivElement>,
  onClose: () => void,
) {
  if (event.target === event.currentTarget) {
    onClose();
  }
}

function ConversationModal({
  contact,
  onClose,
}: {
  contact: ContactActivityContact;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const messages = contact.conversationMessages.length
    ? contact.conversationMessages
    : null;

  return (
    <div
      className="admin-event-modal admin-conversation-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${contact.name?.trim() || "contato"}`}
      onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
    >
      <section className="admin-conversation-panel">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-events-kicker">WhatsApp</p>
            <h2>{contact.name?.trim() || "Nome não informado"}</h2>
            <span>{formatContactPhone(contact.phone)} · {formatInteger(contact.messageCount)} {contact.messageCount === 1 ? "mensagem" : "mensagens"}</span>
          </div>
          <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar conversa">&times;</button>
        </header>
        <div className="admin-conversation-content">
          {messages ? messages.map((message, index) => (
            <span
              key={`${message.createdAt}-${index}`}
              className={`admin-contact-message-bubble ${message.direction === "outbound" ? "is-system" : "is-client"}`}
            >
              <b>{message.direction === "outbound" ? "Sistema" : "Cliente"} · {formatContactDateTime(message.createdAt)}</b>
              {message.body}
            </span>
          )) : (
            <>
              <span className="admin-contact-message-bubble is-client">
                <b>Cliente</b>
                {contact.lastInboundMessage ?? "Sem mensagem recebida registrada."}
              </span>
              <span className="admin-contact-message-bubble is-system">
                <b>Sistema</b>
                {contact.lastOutboundMessage ?? "Sem resposta do sistema registrada."}
              </span>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ContactsModal({
  activity,
  title,
  onClose,
}: {
  activity: EventDashboard["contactActivity"];
  title: string;
  onClose: () => void;
}) {
  const [conversationContact, setConversationContact] = useState<ContactActivityContact | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (conversationContact) {
          setConversationContact(null);
          return;
        }

        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [conversationContact, onClose]);

  return (
    <div
      className="admin-event-modal admin-contacts-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
    >
      <section className="admin-contacts-panel">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-events-kicker">WhatsApp</p>
            <h2>{title}</h2>
            <span>{formatInteger(activity.totalUniqueContacts)} pessoas únicas · {activity.periodLabel}</span>
          </div>
          <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar contatos">&times;</button>
        </header>
        <div className="admin-contacts-list">
          {activity.contacts.length ? activity.contacts.map((contact) => (
            <article key={contact.customerId}>
              <div className="admin-contact-identity">
                <strong>{contact.name?.trim() || "Nome não informado"}</strong>
                <a href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{formatContactPhone(contact.phone)}</a>
              </div>
              <div className="admin-contact-details">
                <div className="admin-contact-facts">
                  <span>{formatInteger(contact.messageCount)} {contact.messageCount === 1 ? "mensagem" : "mensagens"}</span>
                  <span><b>Comprou ingresso:</b> {contact.purchasedTicket ? "Sim" : "Não"}</span>
                  <span><b>Último contato:</b> {formatContactDateTime(contact.lastContactAt)}</span>
                </div>
                <div className="admin-contact-stop">
                  <span><b>Parou em:</b> {contact.stoppedAtLabel}</span>
                  <button
                    type="button"
                    className="admin-contact-message-link"
                    onClick={() => setConversationContact(contact)}
                  >
                    Ver conversa
                  </button>
                </div>
                {contact.purchasedEvents.length ? (
                  <div className="admin-contact-purchases">
                    {contact.purchasedEvents.map((event) => (
                      <span key={event.sessionId}>
                        <b>Evento:</b> {event.name} · {formatContactDateTime(event.startsAt)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          )) : <p className="admin-dashboard-empty">Nenhum contato recebido no período.</p>}
        </div>
      </section>
      {conversationContact ? (
        <ConversationModal
          contact={conversationContact}
          onClose={() => setConversationContact(null)}
        />
      ) : null}
    </div>
  );
}

function draftChanged(event: EventDetails | null, draft: Draft | null) {
  if (!event || !draft) return false;
  return JSON.stringify(buildDraft(event)) !== JSON.stringify(draft);
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
          ? { ...price, sectionName, label: sectionName }
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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

function GeneralDashboardCards({
  dashboard,
  onOpen,
}: {
  dashboard: GeneralDashboard | null;
  onOpen: () => void;
}) {
  if (!dashboard) return null;

  const today = dashboard.today;
  const occupancy = today.capacity > 0 ? Math.round((today.ticketsSold / today.capacity) * 100) : 0;

  return (
    <section className="admin-general-kpis" aria-label="Vendas totais do dia">
      <article>
        <span>Vendas do dia</span>
        <strong>{formatInteger(today.ticketsSold)} / {formatInteger(today.capacity)}</strong>
        <small>{occupancy}% do lote vendido</small>
      </article>
      <article>
        <span>Receita do dia</span>
        <strong>{formatCurrency(today.totalRevenueCents)}</strong>
        <small>Ingressos {formatCurrency(today.ticketRevenueCents)} · Combos {formatCurrency(today.comboRevenueCents)}</small>
      </article>
      <article>
        <span>Combos do dia</span>
        <strong>{formatInteger(today.comboItemsSold)}</strong>
        <small>{formatInteger(today.comboUsed)} retirados · {formatInteger(today.comboOrdersPending)} pendentes</small>
      </article>
      <article>
        <span>Entrada</span>
        <strong>{formatInteger(today.checkins)}</strong>
        <small>Check-ins realizados hoje</small>
      </article>
      <article>
        <span>Cortesias</span>
        <strong>{formatInteger(today.courtesyTickets)}</strong>
        <small>Cortesias emitidas hoje</small>
      </article>
      <button type="button" className="admin-general-plus-card" onClick={onOpen} aria-label="Abrir geral de todos os eventos">
        <PlusIcon />
        <span>Geral</span>
      </button>
    </section>
  );
}

function TicketSalesOverviewIcons({ event }: { event: EventSummary }) {
  if (!event.ticketSalesOverview.length) return null;

  return (
    <span className="admin-event-sales-overview" aria-label="Resumo rápido de vendas por setor">
      {event.ticketSalesOverview.map((item) => {
        const courtesySold = item.courtesySold ?? 0;
        const courtesyAvailable = item.courtesyAvailable ?? item.available;
        const salesSold = item.salesSold ?? item.sold;
        const salesAvailable = item.salesAvailable ?? item.available;
        const courtesyLabel = `${formatInteger(courtesySold)}-${formatInteger(courtesyAvailable)}`;
        const salesLabel = `${formatInteger(salesSold)}-${formatInteger(salesAvailable)}`;

        return (
          <span
            key={item.key}
            className="admin-event-sales-chip"
            data-tooltip={`${item.label}: cortesias ${courtesyLabel} | vendas ${salesLabel}`}
            aria-label={`${item.label}: cortesias ${courtesyLabel}, vendas ${salesLabel}`}
          >
            <i>{item.shortLabel}</i>
            <b><span className="is-courtesy">{courtesyLabel}</span><em>|</em><span className="is-sales">{salesLabel}</span></b>
          </span>
        );
      })}
    </span>
  );
}

function GeneralPeriodList({ title, periods }: { title: string; periods: GeneralDashboardPeriod[] }) {
  return (
    <section className="admin-general-period-card">
      <div className="admin-dashboard-section-heading">
        <div>
          <h3>{title}</h3>
          <p>Ingressos, combos, receita e repasse.</p>
        </div>
      </div>
      <div className="admin-general-period-list">
        {periods.length ? periods.map((period) => (
          <article key={period.key}>
            <strong>{period.label}</strong>
            <span>{formatCurrency(period.totalRevenueCents)}</span>
            <small>{formatInteger(period.ticketsSold)} ingressos · {formatInteger(period.comboItemsSold)} combos</small>
            <small>Repasse 5% {formatCurrency(period.repasseCents)}</small>
          </article>
        )) : <p className="admin-dashboard-empty">Sem vendas no período.</p>}
      </div>
    </section>
  );
}

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

function emptyGeneralPeriod(key: string, capacity: number): GeneralDashboardPeriod {
  return {
    key,
    label: formatDayLabel(key),
    ticketsSold: 0,
    capacity,
    ticketRevenueCents: 0,
    comboRevenueCents: 0,
    totalRevenueCents: 0,
    comboItemsSold: 0,
    comboUsed: 0,
    comboOrdersPending: 0,
    checkins: 0,
    courtesyTickets: 0,
    repasseCents: 0,
  };
}

function addGeneralPeriod(left: GeneralDashboardPeriod, right: GeneralDashboardPeriod) {
  left.ticketsSold += right.ticketsSold;
  left.ticketRevenueCents += right.ticketRevenueCents;
  left.comboRevenueCents += right.comboRevenueCents;
  left.totalRevenueCents += right.totalRevenueCents;
  left.comboItemsSold += right.comboItemsSold;
  left.comboUsed += right.comboUsed;
  left.comboOrdersPending += right.comboOrdersPending;
  left.checkins += right.checkins;
  left.courtesyTickets += right.courtesyTickets;
  left.repasseCents = Math.round(left.totalRevenueCents * 0.05);
}

function getGeneralRangeRows(dashboard: GeneralDashboard, range: GeneralDashboardRange) {
  const sorted = [...dashboard.daily].sort((left, right) => left.key.localeCompare(right.key));
  const byKey = new Map(sorted.map((period) => [period.key, period]));
  const todayKey = dashboard.today.key;
  const capacity = dashboard.today.capacity;
  if (range === "day") {
    const byHour = new Map(
      (dashboard.sixHour ?? []).map((period) => [Number(period.label.replace("h", "")), period]),
    );
    const rows = SIX_HOUR_BOUNDARIES.slice(0, -1).map((hour) => {
      const period = byHour.get(hour) ?? emptyGeneralPeriod(`${todayKey}-${hour}`, capacity);
      return {
        ...period,
        label: formatHour(hour),
        intervalLabel: getSixHourIntervalLabelFromStart(hour),
        positionHour: hour + 3,
      };
    });
    return { rows, summary: { ...dashboard.today, label: "Hoje" } };
  }
  const dayCount = range === "week" ? 7 : range === "30" ? 30 : range === "60" ? 60 : null;
  const startDate = dayCount
    ? addDays(dateFromDayKey(todayKey), -(dayCount - 1))
    : dateFromDayKey(sorted[0]?.key ?? todayKey);
  const endDate = dateFromDayKey(range === "total" ? (sorted[sorted.length - 1]?.key ?? todayKey) : todayKey);
  const rows: GeneralDashboardPeriod[] = [];
  const summary = emptyGeneralPeriod(dayKeyFromDate(startDate), capacity);

  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    const key = dayKeyFromDate(cursor);
    const row = byKey.get(key) ?? emptyGeneralPeriod(key, capacity);
    rows.push(row);
    addGeneralPeriod(summary, row);
  }

  summary.label = range === "total"
    ? "Total"
    : `${formatDayLabel(dayKeyFromDate(startDate))} a ${formatDayLabel(dayKeyFromDate(endDate))}`;

  return { rows, summary };
}

function GeneralSalesLineChart({ rows }: { rows: GeneralDashboardPeriod[] }) {
  const [hover, setHover] = useState<GeneralDashboardPeriod | null>(null);
  const width = 960;
  const height = 150;
  const padding = { top: 16, right: 28, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [row.ticketsSold, row.courtesyTickets]),
  );
  const yTicks = [maxValue, Math.round(maxValue * 0.5), 0]
    .filter((value, index, values) => values.indexOf(value) === index);
  const xForIndex = (index: number) => padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const xForHour = (hour: number) => padding.left + (hour / 24) * chartWidth;
  const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const pointRows = rows.map((row, index) => ({
    row,
    x: row.positionHour !== undefined ? xForHour(row.positionHour) : xForIndex(index),
    purchaseY: yForValue(row.ticketsSold),
    courtesyY: yForValue(row.courtesyTickets),
  }));
  const purchasePath = buildSmoothLinePath(pointRows.map((point) => ({ x: point.x, y: point.purchaseY })));
  const courtesyPath = buildSmoothLinePath(pointRows.map((point) => ({ x: point.x, y: point.courtesyY })));
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));
  const activePoint = hover ? pointRows.find((point) => point.row.key === hover.key) : null;

  return (
    <div className="admin-general-line-chart" onMouseLeave={() => setHover(null)}>
      <div className="admin-dashboard-line-legend">
        <span><i style={{ background: "#16a34a" }} />Compras</span>
        <span><i style={{ background: "#3b82f6" }} />Cortesias</span>
      </div>
      <div className="admin-dashboard-chart-plot">
      {hover && activePoint ? (
        <div
          className="admin-dashboard-line-tooltip"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(Math.min(activePoint.purchaseY, activePoint.courtesyY) / height) * 100}%`,
            borderColor: "#16a34a",
          }}
        >
          <span>{hover.intervalLabel ?? hover.label}</span>
          <strong style={{ color: "#16a34a" }}>{formatInteger(hover.ticketsSold)} compras</strong>
          <em>{formatInteger(hover.courtesyTickets)} cortesias</em>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico geral de vendas por período">
        {yTicks.map((tick) => {
          const y = yForValue(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="admin-dashboard-grid-line" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="admin-dashboard-axis-label">{formatInteger(tick)}</text>
            </g>
          );
        })}
        <path d={purchasePath} className="admin-dashboard-section-line" style={{ stroke: "#16a34a" }} />
        <path d={courtesyPath} className="admin-dashboard-section-line" style={{ stroke: "#3b82f6" }} />
        {pointRows.map((point) => (
          <circle
            key={point.row.key}
            cx={point.x}
            cy={Math.min(point.purchaseY, point.courtesyY)}
            r="9"
            className="admin-dashboard-line-hit"
            onMouseEnter={() => setHover(point.row)}
          />
        ))}
        {rows.every((row) => row.positionHour !== undefined)
          ? SIX_HOUR_BOUNDARIES.map((hour) => (
              <text key={hour} x={xForHour(hour)} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{formatHour(hour)}</text>
            ))
          : pointRows.map((point, index) => index % labelStep === 0 || index === pointRows.length - 1 ? (
              <text key={point.row.key} x={point.x} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{point.row.label}</text>
            ) : null)}
      </svg>
      </div>
    </div>
  );
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

function GeneralDashboardModal({
  dashboard,
  onClose,
}: {
  dashboard: GeneralDashboard;
  onClose: () => void;
}) {
  const [range, setRange] = useState<GeneralDashboardRange>("day");
  const [contactActivity, setContactActivity] = useState(dashboard.contactActivity);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsOpen, setContactsOpen] = useState(false);
  const { rows, summary } = getGeneralRangeRows(dashboard, range);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (contactsOpen) {
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contactsOpen, onClose]);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/admin/events?contacts=1&range=${range}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as {
          ok?: boolean;
          contactActivity?: EventDashboard["contactActivity"];
        };
        if (response.ok && result.ok && result.contactActivity) {
          setContactActivity(result.contactActivity);
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Não foi possível atualizar os contatos.", error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setContactsLoading(false);
      });

    return () => controller.abort();
  }, [range]);

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
                    setContactsLoading(true);
                    setRange(value);
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
            onOpen={() => setContactsOpen(true)}
          />
        </div>
      </section>
      {contactsOpen ? (
        <ContactsModal
          activity={contactActivity}
          title="Contatos gerais"
          onClose={() => setContactsOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function AdminEventsEditor() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EventFilterStatus>("published");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventDetails | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicatingEventId, setDuplicatingEventId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [generalDashboard, setGeneralDashboard] = useState<GeneralDashboard | null>(null);
  const [generalDashboardOpen, setGeneralDashboardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("event");
  const [contactsOpen, setContactsOpen] = useState(false);
  const [eventDashboardRangeLoading, setEventDashboardRangeLoading] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (contactsOpen) {
        return;
      }

      if (dashboard) {
        setDashboard(null);
        return;
      }

      if (selected) {
        setSelected(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contactsOpen, dashboard, selected]);

  const loadEvents = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/events?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = await response.json() as {
        ok?: boolean;
        events?: EventSummary[];
        dashboard?: GeneralDashboard | null;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Não foi possível carregar os eventos.");
        return;
      }

      setEvents(data.events ?? []);
      setGeneralDashboard(data.dashboard ?? null);
    } catch {
      setMessage("Não foi possível carregar os eventos.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  async function openEvent(eventId: string) {
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        credentials: "same-origin",
      });
      const data = await response.json() as { ok?: boolean; event?: EventDetails; message?: string };

      if (!response.ok || !data.ok || !data.event) {
        setMessage(data.message ?? "Não foi possível abrir o evento.");
        return;
      }

      setSelected(data.event);
      setDraft(buildDraft(data.event));
      setActiveTab("event");
    } catch {
      setMessage("Não foi possível abrir o evento.");
    }
  }

  async function persistDraft(options: { successMessage?: string } = {}) {
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
      setMessage(options.successMessage ?? "Evento salvo com segurança.");
      await loadEvents();
      return true;
    } catch {
      setMessage("Não foi possível salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistDraft();
  }

  async function changeTab(nextTab: ActiveTab) {
    if (nextTab === activeTab || saving) return;

    if (!draftChanged(selected, draft)) {
      setActiveTab(nextTab);
      return;
    }

    const saved = await persistDraft({
      successMessage: "Alterações salvas. Dados atualizados para a próxima etapa.",
    });

    if (saved) {
      setActiveTab(nextTab);
    }
  }

  async function deleteEvent(eventId: string) {
    const confirmed = window.confirm("Excluir este evento da área pública? O histórico será preservado como cancelado.");
    if (!confirmed) return;

    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
      });
      const data = await response.json() as { ok?: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Não foi possível excluir o evento.");
        return;
      }

      if (selected?.eventId === eventId) {
        setSelected(null);
        setDraft(null);
      }

      setMessage("Evento excluído da venda e preservado no histórico.");
      await loadEvents();
    } catch {
      setMessage("Não foi possível excluir o evento.");
    }
  }

  async function duplicateEvent(eventId: string) {
    const confirmed = window.confirm("Duplicar este evento como rascunho?");
    if (!confirmed) return;

    setDuplicatingEventId(eventId);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
      });
      const data = await response.json() as { ok?: boolean; eventId?: string; event?: EventDetails; message?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Não foi possível duplicar o evento.");
        return;
      }

      setMessage("Evento duplicado como rascunho.");
      await loadEvents();

      if (data.event) {
        setSelected(data.event);
        setDraft(buildDraft(data.event));
        setActiveTab("event");
      } else if (data.eventId) {
        await openEvent(data.eventId);
      }
    } catch {
      setMessage("Não foi possível duplicar o evento.");
    } finally {
      setDuplicatingEventId(null);
    }
  }

  async function openDashboard(event: EventSummary) {
    setContactsOpen(false);
    setDashboard({ event, data: null, loading: true, message: null });

    try {
      const response = await fetch(`/api/admin/events/${event.eventId}?dashboard=1`, {
        credentials: "same-origin",
      });
      const data = await response.json() as { ok?: boolean; dashboard?: EventDashboard; message?: string };

      if (!response.ok || !data.ok || !data.dashboard) {
        setDashboard({ event, data: null, loading: false, message: data.message ?? "Não foi possível carregar a dashboard." });
        return;
      }

      setDashboard({ event, data: data.dashboard, loading: false, message: null });
    } catch {
      setDashboard({ event, data: null, loading: false, message: "Não foi possível carregar a dashboard." });
    }
  }

  async function changeEventDashboardRange(range: ContactRange) {
    if (!dashboard?.data || dashboard.data.range === range || eventDashboardRangeLoading) return;
    setEventDashboardRangeLoading(true);

    try {
      const response = await fetch(`/api/admin/events/${dashboard.event.eventId}?dashboard=1&range=${range}`, {
        credentials: "same-origin",
      });
      const result = await response.json() as {
        ok?: boolean;
        dashboard?: EventDashboard;
        message?: string;
      };
      if (!response.ok || !result.ok || !result.dashboard) {
        setMessage(result.message ?? "Não foi possível atualizar o período.");
        return;
      }
      setDashboard((current) => current ? { ...current, data: result.dashboard!, message: null } : current);
    } catch {
      setMessage("Não foi possível atualizar o período.");
    } finally {
      setEventDashboardRangeLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadEvents]);

  return (
    <>
      <header className="admin-events-header">
        <BrandLogo />
        <div>
          <h1>Editar eventos</h1>
        </div>
      </header>

      <GeneralDashboardCards dashboard={generalDashboard} onOpen={() => setGeneralDashboardOpen(true)} />

      <section className="admin-events-toolbar" aria-label="Filtros">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadEvents();
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, artista ou cidade"
          />
          <button type="submit">Buscar</button>
        </form>
        <select value={status} onChange={(event) => setStatus(event.target.value as EventFilterStatus)}>
          <option value="all">Todos</option>
          <option value="draft">Rascunhos</option>
          <option value="paused">Pausados</option>
          <option value="published">Publicados</option>
          <option value="cancelled">Cancelados</option>
          <option value="finished">Finalizados</option>
        </select>
      </section>

      {message ? <p className="admin-events-message">{message}</p> : null}

      <section className="admin-events-grid" aria-live="polite">
        {loading ? <p className="admin-events-empty">Carregando eventos...</p> : null}
        {!loading && events.length === 0 ? <p className="admin-events-empty">Nenhum evento encontrado.</p> : null}
        {events.map((event) => (
          <article
            key={event.eventId}
            className="admin-event-card"
            onClick={() => void openEvent(event.eventId)}
            role="button"
            tabIndex={0}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                void openEvent(event.eventId);
              }
            }}
          >
            {event.imageUrl ? <img src={event.imageUrl} alt="" /> : <span className="admin-event-card-image" />}
            <span className="admin-event-card-body">
              <span className="admin-event-card-actions">
                <span className={`admin-event-status is-${event.displayStatus}`}>{statusLabels[event.displayStatus]}</span>
                <button
                  type="button"
                  className="admin-event-action-button"
                  aria-label={`Editar ${event.title}`}
                  data-tooltip="Editar"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    void openEvent(event.eventId);
                  }}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="admin-event-action-button"
                  aria-label={`Duplicar ${event.title}`}
                  data-tooltip="Duplicar"
                  disabled={duplicatingEventId === event.eventId}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    void duplicateEvent(event.eventId);
                  }}
                >
                  <DuplicateIcon />
                </button>
                <button
                  type="button"
                  className="admin-event-action-button"
                  aria-label={`Dashboard de ${event.title}`}
                  data-tooltip="Dashboard"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    void openDashboard(event);
                  }}
                >
                  <ChartIcon />
                </button>
                <button
                  type="button"
                  className="admin-event-action-button is-danger"
                  aria-label={`Excluir ${event.title}`}
                  data-tooltip="Excluir"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    void deleteEvent(event.eventId);
                  }}
                >
                  <DeleteIcon />
                </button>
              </span>
              <strong>{event.title}</strong>
              <small>{event.city}/{event.state} · {formatDateTime(event.nextSessionStartsAt)}</small>
              <TicketSalesOverviewIcons event={event} />
            </span>
          </article>
        ))}
      </section>

      {dashboard ? (
        <div
          className="admin-event-modal admin-dashboard-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard do evento"
          onMouseDown={(event) => closeOnOverlayClick(event, () => {
            setContactsOpen(false);
            setDashboard(null);
          })}
        >
          <section className="admin-dashboard-panel">
            <header className="admin-dashboard-header">
              <div>
                <p className="admin-events-kicker">Dashboard</p>
                <h2>{dashboard.event.title}</h2>
                <span>{dashboard.event.city}/{dashboard.event.state} · {formatDateTime(dashboard.event.nextSessionStartsAt)}</span>
              </div>
              <button type="button" className="admin-event-icon-button" onClick={() => { setContactsOpen(false); setDashboard(null); }} aria-label="Fechar">&times;</button>
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
                        disabled={eventDashboardRangeLoading}
                        onClick={() => void changeEventDashboardRange(value)}
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

                  <ContactActivitySection
                    activity={data.contactActivity}
                    eventSpecific
                    onOpen={() => setContactsOpen(true)}
                  />

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
      ) : null}

      {dashboard?.data && contactsOpen ? (
        <ContactsModal activity={dashboard.data.contactActivity} title={`Contatos compradores — ${dashboard.event.title}`} onClose={() => setContactsOpen(false)} />
      ) : null}

      {generalDashboardOpen && generalDashboard ? (
        <GeneralDashboardModal dashboard={generalDashboard} onClose={() => setGeneralDashboardOpen(false)} />
      ) : null}

      {selected && draft ? (
        <div
          className="admin-event-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Editar evento"
          onMouseDown={(event) => closeOnOverlayClick(event, () => setSelected(null))}
        >
          <form className="admin-event-modal-panel" onSubmit={saveEvent}>
            <header>
              <div>
                <p className="admin-events-kicker">Editando</p>
                <h2>{selected.title}</h2>
              </div>
              <button type="button" className="admin-event-icon-button" onClick={() => setSelected(null)} aria-label="Fechar">&times;</button>
            </header>

            <nav className="admin-event-tabs" aria-label="Áreas do evento">
              <button type="button" className={activeTab === "event" ? "is-active" : ""} disabled={saving} onClick={() => void changeTab("event")}>Evento</button>
              <button type="button" className={activeTab === "sessions" ? "is-active" : ""} disabled={saving} onClick={() => void changeTab("sessions")}>Sessões</button>
              <button type="button" className={activeTab === "sections" ? "is-active" : ""} disabled={saving} onClick={() => void changeTab("sections")}>Setores</button>
              <button type="button" className={activeTab === "prices" ? "is-active" : ""} disabled={saving} onClick={() => void changeTab("prices")}>Preços</button>
              <button type="button" className={activeTab === "courtesy" ? "is-active" : ""} disabled={saving} onClick={() => void changeTab("courtesy")}>Cortesia</button>
            </nav>

            <div className="admin-event-modal-content">
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
                        <label>Nome no ingresso<input value={price.label} readOnly /></label>
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
            </div>

            <footer>
              <span>Alterações são validadas no servidor antes de gravar.</span>
              <button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}


