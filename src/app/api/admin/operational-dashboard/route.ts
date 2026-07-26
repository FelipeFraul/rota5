import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminEventEditorSession } from "@/lib/tickets/services/adminWebAuth";
import type { OperationalDashboardData } from "@/lib/tickets/services/operationalDashboardTypes";

const ALLOWED_COMPARISON_DAYS = new Set([7, 15, 30, 60, 90]);
type DashboardResult = ({ ok?: boolean; reason?: string } & Partial<OperationalDashboardData>) | null;

function parseComparisonDays(value: string | null) {
  const parsed = Number(value ?? "30");
  return ALLOWED_COMPARISON_DAYS.has(parsed) ? parsed : 30;
}

function parseEventId(value: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : "invalid";
}

function sumRecords(records: Array<Record<string, number | null> | undefined>) {
  const totals: Record<string, number> = {};
  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "number") totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return totals;
}

function sumSeries(dashboards: OperationalDashboardData[], key: string) {
  const byDate = new Map<string, number>();
  for (const dashboard of dashboards) {
    for (const point of dashboard.revenue.series) {
      if (typeof point.date === "string") byDate.set(point.date, byDate.get(point.date) ?? 0);
    }
  }
  for (const dashboard of dashboards) {
    const moduleSeries =
      key === "paidTickets" ? dashboard.tickets.series :
      key === "paidItems" ? dashboard.combos.series :
      key === "uniqueContacts" ? dashboard.whatsapp.series :
      dashboard.revenue.series;
    for (const point of moduleSeries) {
      if (typeof point.date !== "string") continue;
      byDate.set(point.date, (byDate.get(point.date) ?? 0) + Number(point[key] ?? 0));
    }
  }
  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, [key]: value }));
}

function buildEventSeries(dashboards: OperationalDashboardData[], moduleName: "revenue" | "tickets" | "combos" | "whatsapp") {
  return dashboards.map((dashboard) => ({
    eventId: dashboard.event?.id ?? "",
    eventTitle: dashboard.event?.title ?? "Evento",
    points: dashboard[moduleName].series,
  })).filter((series) => series.eventId);
}

function sortByTimeDesc(items: Array<Record<string, string | number | null>>, key = "time") {
  return [...items].sort((left, right) => {
    const leftTime = typeof left[key] === "string" ? Date.parse(left[key]) : 0;
    const rightTime = typeof right[key] === "string" ? Date.parse(right[key]) : 0;
    return rightTime - leftTime;
  });
}

function aggregatePaymentMethods(dashboards: OperationalDashboardData[]) {
  const byMethod = new Map<string, number>();
  for (const dashboard of dashboards) {
    for (const method of dashboard.revenue.paymentMethods) {
      const name = String(method.method ?? "Outro");
      byMethod.set(name, (byMethod.get(name) ?? 0) + Number(method.valueCents ?? 0));
    }
  }
  const total = Array.from(byMethod.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(byMethod.entries()).map(([method, valueCents]) => ({
    method,
    valueCents,
    percentage: total > 0 ? (valueCents / total) * 100 : 0,
  }));
}

function aggregateTopOffers(dashboards: OperationalDashboardData[]) {
  const byOffer = new Map<string, { quantity: number; revenueCents: number }>();
  for (const dashboard of dashboards) {
    for (const offer of dashboard.combos.topOffers) {
      const name = String(offer.name ?? "Combo");
      const current = byOffer.get(name) ?? { quantity: 0, revenueCents: 0 };
      current.quantity += Number(offer.quantity ?? 0);
      current.revenueCents += Number(offer.revenueCents ?? 0);
      byOffer.set(name, current);
    }
  }
  return Array.from(byOffer.entries())
    .map(([name, values]) => ({ name, ...values }))
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 10);
}

function aggregateAllEvents(base: OperationalDashboardData, dashboards: OperationalDashboardData[], responseTimeMs: number): OperationalDashboardData {
  return {
    ...base,
    event: null,
    revenue: {
      summary: sumRecords(dashboards.map((dashboard) => dashboard.revenue.summary)),
      series: sumSeries(dashboards, "totalRevenueCents"),
      eventSeries: buildEventSeries(dashboards, "revenue"),
      latestSales: sortByTimeDesc(dashboards.flatMap((dashboard) => dashboard.revenue.latestSales)).slice(0, 10),
      paymentMethods: aggregatePaymentMethods(dashboards),
    },
    tickets: {
      summary: sumRecords(dashboards.map((dashboard) => dashboard.tickets.summary)),
      series: sumSeries(dashboards, "paidTickets"),
      eventSeries: buildEventSeries(dashboards, "tickets"),
      latestIssued: sortByTimeDesc(dashboards.flatMap((dashboard) => dashboard.tickets.latestIssued)).slice(0, 10),
      latestCheckins: sortByTimeDesc(dashboards.flatMap((dashboard) => dashboard.tickets.latestCheckins)).slice(0, 10),
      problems: sumRecords(dashboards.map((dashboard) => dashboard.tickets.problems)),
    },
    combos: {
      summary: sumRecords(dashboards.map((dashboard) => dashboard.combos.summary)),
      series: sumSeries(dashboards, "paidItems"),
      eventSeries: buildEventSeries(dashboards, "combos"),
      topOffers: aggregateTopOffers(dashboards),
      latest: sortByTimeDesc(dashboards.flatMap((dashboard) => dashboard.combos.latest)).slice(0, 10),
      problems: sumRecords(dashboards.map((dashboard) => dashboard.combos.problems)),
    },
    whatsapp: {
      summary: sumRecords(dashboards.map((dashboard) => dashboard.whatsapp.summary)),
      series: sumSeries(dashboards, "uniqueContacts"),
      eventSeries: buildEventSeries(dashboards, "whatsapp"),
      latestActivity: sortByTimeDesc(dashboards.flatMap((dashboard) => dashboard.whatsapp.latestActivity)).slice(0, 10),
      problems: sumRecords(dashboards.map((dashboard) => dashboard.whatsapp.problems)),
    },
    alerts: {
      summary: {
        total: dashboards.reduce((sum, dashboard) => sum + dashboard.alerts.summary.total, 0),
        critical: dashboards.reduce((sum, dashboard) => sum + dashboard.alerts.summary.critical, 0),
        warning: dashboards.reduce((sum, dashboard) => sum + dashboard.alerts.summary.warning, 0),
        info: dashboards.reduce((sum, dashboard) => sum + dashboard.alerts.summary.info, 0),
      },
      items: sortByTimeDesc(dashboards.flatMap((dashboard) => dashboard.alerts.items), "detectedAt").slice(0, 30) as OperationalDashboardData["alerts"]["items"],
    },
    responseTimeMs,
  };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: "Sessao expirada. Abra um novo link pelo WhatsApp." },
      { status: auth.reason === "forbidden" ? 403 : 401 },
    );
  }

  const url = new URL(request.url);
  const eventId = parseEventId(url.searchParams.get("eventId"));
  if (eventId === "invalid") {
    return NextResponse.json({ ok: false, message: "Evento invalido." }, { status: 400 });
  }

  const comparisonDays = parseComparisonDays(url.searchParams.get("comparisonDays"));

  try {
    const supabase = getSupabaseAdmin();
    const loadDashboard = async (targetEventId: string | null) => {
      const { data, error } = await supabase.rpc("get_admin_intelligence_dashboard", {
        p_admin_user_id: auth.session.adminUser.id,
        p_event_id: targetEventId,
        p_comparison_days: comparisonDays,
        p_timezone: "America/Sao_Paulo",
      });

      if (error) throw error;
      return data as DashboardResult;
    };

    const result = await loadDashboard(eventId);
    if (!result?.ok) {
      return NextResponse.json(
        { ok: false, message: result?.reason === "event_forbidden" ? "Evento fora do escopo." : "Acesso negado." },
        { status: result?.reason === "event_forbidden" ? 403 : 403 },
      );
    }

    const responseTimeMs = Math.round(performance.now() - startedAt);
    let dashboard = { ...result, ok: undefined, responseTimeMs } as OperationalDashboardData;

    if (!eventId && dashboard.events.length > 0) {
      const dashboards = (await Promise.all(dashboard.events.map((event) => loadDashboard(event.id))))
        .filter((payload): payload is OperationalDashboardData & { ok?: boolean } => Boolean(payload?.ok));
      if (dashboards.length > 0) {
        dashboard = aggregateAllEvents(dashboard, dashboards, responseTimeMs);
      }
    }

    return NextResponse.json({
      ok: true,
      dashboard,
    });
  } catch (error) {
    console.error("[operational-dashboard] failed to load dashboard", error);
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel carregar o painel operacional." },
      { status: 500 },
    );
  }
}
