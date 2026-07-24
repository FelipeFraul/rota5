import { NextResponse } from "next/server";

import {
  assertAdminCsrf,
  requireAdminEventEditorSession,
} from "@/lib/tickets/services/adminWebAuth";
import {
  getOfficialTableMapPlaces,
} from "@/lib/tickets/tableMap/officialPlaceCoordinates";
import { persistOfficialTableMapPlaces } from "@/lib/tickets/tableMap/persistOfficialPlaces";

export async function GET() {
  const auth = await requireAdminEventEditorSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const places = await getOfficialTableMapPlaces();

  return NextResponse.json(
    { ok: true, places },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const auth = await requireAdminEventEditorSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  if (!assertAdminCsrf(request, auth.session)) {
    return NextResponse.json({ ok: false, message: "Sessao expirada. Reabra o editor." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const result = await persistOfficialTableMapPlaces(body?.places);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: "Catalogo invalido.", reason: result.reason },
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
