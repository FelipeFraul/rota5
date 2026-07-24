import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  duplicateComboOffer,
  updateComboOfferDetails,
  updateComboOfferScope,
  updateComboOfferStatus,
  type ComboOfferScopeInput,
  type ComboOfferTimingType,
} from "@/lib/tickets/services/comboOffers";
import {
  assertAdminCsrf,
  requireAdminEventEditorSession,
} from "@/lib/tickets/services/adminWebAuth";

type Params = {
  params: Promise<{ offerId: string }>;
};

type ComboOfferPatchPayload = {
  name?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  priceCents?: unknown;
  displayPriority?: unknown;
  status?: unknown;
  timingType?: unknown;
  customOffsetMinutes?: unknown;
  scope?: unknown;
};

const TIMING_TYPES = new Set<ComboOfferTimingType>([
  "three_hours_before",
  "one_hour_before",
  "event_day_noon",
  "custom",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePriceCents(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function parseDisplayPriority(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 1000) return null;
  return value;
}

function parseTimingType(value: unknown) {
  return typeof value === "string" && TIMING_TYPES.has(value as ComboOfferTimingType)
    ? value as ComboOfferTimingType
    : null;
}

function parseScope(value: unknown): ComboOfferScopeInput | null {
  if (!value || typeof value !== "object") return null;
  const scope = value as { scopeType?: unknown; eventIds?: unknown; weekdays?: unknown };
  if (scope.scopeType === "all_events") return { scopeType: "all_events" };
  if (scope.scopeType === "event" && Array.isArray(scope.eventIds)) {
    const eventIds = scope.eventIds.filter((eventId): eventId is string => typeof eventId === "string" && isUuid(eventId));
    return eventIds.length ? { scopeType: "event", eventIds } : null;
  }
  if (scope.scopeType === "weekday" && Array.isArray(scope.weekdays)) {
    const weekdays = scope.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6);
    return weekdays.length ? { scopeType: "weekday", weekdays } : null;
  }
  return null;
}

function getPayloadLogShape(payload: ComboOfferPatchPayload | null) {
  if (!payload || typeof payload !== "object") return { payloadType: typeof payload };

  return {
    nameType: typeof payload.name,
    nameLength: typeof payload.name === "string" ? payload.name.trim().length : null,
    descriptionType: typeof payload.description,
    descriptionLength: typeof payload.description === "string" ? payload.description.trim().length : null,
    imageUrlType: payload.imageUrl === null ? "null" : typeof payload.imageUrl,
    hasImageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl.trim().length > 0 : false,
    priceCents: payload.priceCents,
    displayPriority: payload.displayPriority,
    status: payload.status,
    timingType: payload.timingType,
    customOffsetMinutes: payload.customOffsetMinutes,
    scope: payload.scope && typeof payload.scope === "object"
      ? {
          scopeType: (payload.scope as { scopeType?: unknown }).scopeType,
          eventIdsCount: Array.isArray((payload.scope as { eventIds?: unknown }).eventIds)
            ? ((payload.scope as { eventIds: unknown[] }).eventIds).length
            : null,
          weekdaysCount: Array.isArray((payload.scope as { weekdays?: unknown }).weekdays)
            ? ((payload.scope as { weekdays: unknown[] }).weekdays).length
            : null,
        }
      : payload.scope === undefined ? undefined : typeof payload.scope,
  };
}

function logComboOfferPatchFailure(
  offerId: string,
  reason: string,
  payload: ComboOfferPatchPayload | null,
  extra: Record<string, unknown> = {},
) {
  console.warn("[admin-combo-offers] patch rejected", {
    offerId,
    reason,
    payload: getPayloadLogShape(payload),
    ...extra,
  });
}

async function requireEditableComboOffer(request: Request, offerId: string) {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 }) };
  }

  if (!assertAdminCsrf(request, auth.session)) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Sessão expirada. Atualize a página." }, { status: 403 }) };
  }

  const { data: offer, error: offerError } = await getSupabaseAdmin()
    .from("combo_offers")
    .select("id, created_by_admin_user_id, status")
    .eq("id", offerId)
    .neq("status", "deleted")
    .maybeSingle<{
      id: string;
      created_by_admin_user_id: string | null;
      status: string;
    }>();

  if (offerError) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Não foi possível carregar a oferta." }, { status: 500 }) };
  }

  if (!offer) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Oferta não encontrada." }, { status: 404 }) };
  }

  const isRoot = auth.session.adminUser.role === "root";
  if (!isRoot && offer.created_by_admin_user_id !== auth.session.adminUser.id) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Sem permissão para editar esta oferta." }, { status: 403 }) };
  }

  return { ok: true as const, offer, auth };
}

export async function PATCH(request: Request, { params }: Params) {
  const { offerId } = await params;
  if (!isUuid(offerId)) {
    return NextResponse.json({ ok: false, message: "Oferta inválida." }, { status: 400 });
  }

  const editable = await requireEditableComboOffer(request, offerId);
  if (!editable.ok) return editable.response;

  const payload = await request.json().catch(() => null) as ComboOfferPatchPayload | null;
  if (!payload || typeof payload !== "object") {
    logComboOfferPatchFailure(offerId, "invalid_payload", payload);
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const timingType = payload.timingType === undefined ? undefined : parseTimingType(payload.timingType);
  if (payload.timingType !== undefined && !timingType) {
    logComboOfferPatchFailure(offerId, "invalid_timing_type", payload);
    return NextResponse.json({ ok: false, message: "Regra de envio inválida." }, { status: 400 });
  }

  const priceCents = payload.priceCents === undefined ? undefined : parsePriceCents(payload.priceCents);
  if (payload.priceCents !== undefined && !priceCents) {
    logComboOfferPatchFailure(offerId, "invalid_price_cents", payload);
    return NextResponse.json({ ok: false, message: "Preço inválido." }, { status: 400 });
  }

  const displayPriority = payload.displayPriority === undefined
    ? undefined
    : parseDisplayPriority(payload.displayPriority);
  if (payload.displayPriority !== undefined && !displayPriority) {
    logComboOfferPatchFailure(offerId, "invalid_display_priority", payload);
    return NextResponse.json({ ok: false, message: "Prioridade inválida." }, { status: 400 });
  }

  const customOffsetMinutes = payload.customOffsetMinutes === undefined
    ? undefined
    : typeof payload.customOffsetMinutes === "number" && Number.isInteger(payload.customOffsetMinutes) && payload.customOffsetMinutes > 0
      ? payload.customOffsetMinutes
      : null;
  if (payload.customOffsetMinutes !== undefined && customOffsetMinutes === null) {
    logComboOfferPatchFailure(offerId, "invalid_custom_offset_minutes", payload);
    return NextResponse.json({ ok: false, message: "Intervalo inválido." }, { status: 400 });
  }

  const scope = payload.scope === undefined ? undefined : parseScope(payload.scope);
  if (payload.scope !== undefined && !scope) {
    logComboOfferPatchFailure(offerId, "invalid_scope", payload);
    return NextResponse.json({ ok: false, message: "Escopo invÃ¡lido." }, { status: 400 });
  }

  const hasDetailsChange =
    typeof payload.name === "string" ||
    typeof payload.description === "string" ||
    typeof payload.imageUrl === "string" ||
    payload.imageUrl === null ||
    priceCents !== undefined ||
    displayPriority !== undefined ||
    timingType !== undefined;

  if (hasDetailsChange) {
    const detailsResult = await updateComboOfferDetails({
      offerId,
      name: typeof payload.name === "string" ? payload.name : undefined,
      description: typeof payload.description === "string" ? payload.description : undefined,
      imageUrl: typeof payload.imageUrl === "string" || payload.imageUrl === null ? payload.imageUrl : undefined,
      priceCents: priceCents ?? undefined,
      displayPriority: displayPriority ?? undefined,
      timingType: timingType ?? undefined,
      customOffsetMinutes,
    });

    if (!detailsResult.ok) {
      logComboOfferPatchFailure(offerId, "details_update_failed", payload, {
        resultReason: detailsResult.reason,
        error: detailsResult.reason === "database_error" && "error" in detailsResult
          ? detailsResult.error
          : undefined,
      });
      return NextResponse.json({ ok: false, message: "Não foi possível salvar a oferta." }, { status: 400 });
    }
  }

  if (payload.status !== undefined) {
    const status = payload.status === "active" || payload.status === "paused" ? payload.status : null;
    if (!status) {
      logComboOfferPatchFailure(offerId, "invalid_status", payload);
      return NextResponse.json({ ok: false, message: "Status inválido." }, { status: 400 });
    }

    const statusResult = await updateComboOfferStatus(offerId, status);
    if (!statusResult.ok) {
      logComboOfferPatchFailure(offerId, "status_update_failed", payload, { error: statusResult.error });
      return NextResponse.json({ ok: false, message: "Não foi possível atualizar o status." }, { status: 500 });
    }
  }

  if (scope) {
    const scopeResult = await updateComboOfferScope(offerId, scope);
    if (!scopeResult.ok) {
      logComboOfferPatchFailure(offerId, "scope_update_failed", payload, {
        resultReason: scopeResult.reason,
        error: scopeResult.reason === "database_error" && "error" in scopeResult
          ? scopeResult.error
          : undefined,
      });
      return NextResponse.json({ ok: false, message: "NÃ£o foi possÃ­vel atualizar o escopo." }, { status: 400 });
    }
  }

  if (!hasDetailsChange && payload.status === undefined && scope === undefined) {
    logComboOfferPatchFailure(offerId, "empty_patch", payload);
    return NextResponse.json({ ok: false, message: "Nenhuma alteração enviada." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: Params) {
  const { offerId } = await params;
  if (!isUuid(offerId)) {
    return NextResponse.json({ ok: false, message: "Oferta inválida." }, { status: 400 });
  }

  const editable = await requireEditableComboOffer(request, offerId);
  if (!editable.ok) return editable.response;

  const result = await duplicateComboOffer(offerId, editable.auth.session.adminUser.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: "Não foi possível duplicar o combo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, offerId: result.offerId });
}

export async function DELETE(request: Request, { params }: Params) {
  const { offerId } = await params;
  if (!isUuid(offerId)) {
    return NextResponse.json({ ok: false, message: "Oferta inválida." }, { status: 400 });
  }

  const editable = await requireEditableComboOffer(request, offerId);
  if (!editable.ok) return editable.response;

  const result = await updateComboOfferStatus(offerId, "deleted");
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: "Não foi possível excluir o combo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
