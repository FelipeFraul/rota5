"use client";

import type { EventDashboard, GeneralDashboard, GeneralDashboardPeriod, GeneralDashboardRange } from "../AdminEventsEditor";

export const SIX_HOUR_BOUNDARIES = [0, 6, 12, 18, 24] as const;

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatDateTime(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function dateFromDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function dayKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatDayLabel(key: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateFromDayKey(key)).replace(".", "");
}

export function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}h`;
}

export function getSixHourIntervalLabelFromStart(startHour: number) {
  return `${formatHour(startHour)}–${formatHour(startHour + 6)}`;
}

export function buildSmoothLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

export function buildDailyLineData(data: EventDashboard) {
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
    });
  }

  return rows;
}

export function emptyGeneralPeriod(key: string, capacity: number): GeneralDashboardPeriod {
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

export function addGeneralPeriod(left: GeneralDashboardPeriod, right: GeneralDashboardPeriod) {
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

export function getGeneralRangeRows(dashboard: GeneralDashboard, range: GeneralDashboardRange) {
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
