import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminEventEditorSession } from "@/lib/tickets/services/adminWebAuth";
import type { OperationalDashboardData } from "@/lib/tickets/services/operationalDashboardTypes";

const ALLOWED_COMPARISON_DAYS = new Set([7, 15, 30, 60, 90]);

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
    const { data, error } = await getSupabaseAdmin().rpc("get_admin_intelligence_dashboard", {
      p_admin_user_id: auth.session.adminUser.id,
      p_event_id: eventId,
      p_comparison_days: comparisonDays,
      p_timezone: "America/Sao_Paulo",
    });

    if (error) throw error;

    const result = data as ({ ok?: boolean; reason?: string } & Partial<OperationalDashboardData>) | null;
    if (!result?.ok) {
      return NextResponse.json(
        { ok: false, message: result?.reason === "event_forbidden" ? "Evento fora do escopo." : "Acesso negado." },
        { status: result?.reason === "event_forbidden" ? 403 : 403 },
      );
    }

    const responseTimeMs = Math.round(performance.now() - startedAt);
    return NextResponse.json({
      ok: true,
      dashboard: {
        ...result,
        ok: undefined,
        responseTimeMs,
      },
    });
  } catch (error) {
    console.error("[operational-dashboard] failed to load dashboard", error);
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel carregar o painel operacional." },
      { status: 500 },
    );
  }
}
