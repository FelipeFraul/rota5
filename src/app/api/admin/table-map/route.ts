import { NextResponse } from "next/server";

import {
  assertAdminCsrf,
  requireAdminEventEditorSession,
} from "@/lib/tickets/services/adminWebAuth";
import {
  getOfficialTableMapPlaces,
} from "@/lib/tickets/tableMap/officialPlaceCoordinates";
import { persistOfficialTableMapPlaces } from "@/lib/tickets/tableMap/persistOfficialPlaces";
import { renderOfficialTableMap } from "@/lib/tickets/tableMap/renderOfficialTableMap";

function getErrorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "Erro desconhecido.")
    : String(error ?? "Erro desconhecido.");
}

export async function GET(request: Request) {
  const auth = await requireAdminEventEditorSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "N?o autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);

  if (url.searchParams.get("preview") === "final") {
    try {
      const rendered = await renderOfficialTableMap({ format: "png" });

      return NextResponse.json(
        {
          ok: true,
          imageUrl: `data:${rendered.mimeType};base64,${rendered.buffer.toString("base64")}`,
        },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          message: "N?o foi poss?vel renderizar a imagem final do mapa.",
          reason: "database_error",
          details: getErrorMessage(error),
        },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }
  }

  try {
    const places = await getOfficialTableMapPlaces();

    return NextResponse.json(
      { ok: true, places },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "N?o foi poss?vel carregar as coordenadas salvas do mapa.",
        reason: "database_error",
        details: getErrorMessage(error),
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminEventEditorSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "N?o autorizado." }, { status: 401 });
  }

  if (!assertAdminCsrf(request, auth.session)) {
    return NextResponse.json({ ok: false, message: "Sessao expirada. Reabra o editor." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const result = await persistOfficialTableMapPlaces(body?.places);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, reason: result.reason, details: result.details },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      places: result.places,
      previews: result.previews,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
