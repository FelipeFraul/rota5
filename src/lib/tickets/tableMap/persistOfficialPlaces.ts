import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_PLACES,
  OFFICIAL_TABLE_MAP_WIDTH,
  type OfficialTableMapPlace,
} from "@/lib/tickets/tableMap/officialPlaces";
import { renderOfficialTableMap } from "@/lib/tickets/tableMap/renderOfficialTableMap";
import { getOfficialTableMapPlaces } from "@/lib/tickets/tableMap/officialPlaceCoordinates";

const previewDir = path.join(process.cwd(), ".tmp", "official-table-map");
const unavailableSample = ["03", "08", "21", "27", "41", "51"] as const;

type PersistOfficialPlacesResult =
  | { ok: true; places: readonly OfficialTableMapPlace[]; previews: string[] }
  | {
      ok: false;
      reason: "invalid_count" | "invalid_code" | "invalid_metadata" | "invalid_coordinate" | "database_error";
      message: string;
      details?: string;
    };

function getErrorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "Erro desconhecido.")
    : String(error ?? "Erro desconhecido.");
}

function normalizePlaces(input: unknown): OfficialTableMapPlace[] | null {
  if (!Array.isArray(input) || input.length !== OFFICIAL_TABLE_MAP_PLACES.length) {
    return null;
  }

  return input.map((rawPlace) => {
    const place = rawPlace as Partial<OfficialTableMapPlace>;

    return {
      code: String(place.code ?? "").padStart(2, "0"),
      type: place.type,
      environment: place.environment,
      capacity: place.capacity,
      x: Math.round(Number(place.x)),
      y: Math.round(Number(place.y)),
      ...(Number.isFinite(Number(place.labelSize))
        ? { labelSize: Math.round(Number(place.labelSize)) }
        : {}),
    };
  }) as OfficialTableMapPlace[];
}

function validatePlaces(places: readonly OfficialTableMapPlace[] | null): PersistOfficialPlacesResult | null {
  if (!places) {
    return { ok: false, reason: "invalid_count", message: "Quantidade de lugares diferente do catalogo oficial." };
  }

  const originalByCode = new Map(OFFICIAL_TABLE_MAP_PLACES.map((place) => [place.code, place]));
  const codes = places.map((place) => place.code);

  if (new Set(codes).size !== OFFICIAL_TABLE_MAP_PLACES.length) {
    return { ok: false, reason: "invalid_code", message: "Ha codigos duplicados ou ausentes no mapa." };
  }

  for (const place of places) {
    const original = originalByCode.get(place.code);
    if (!original) {
      return { ok: false, reason: "invalid_code", message: `Lugar ${place.code} nao pertence ao catalogo oficial.` };
    }
    if (place.type !== original.type || place.environment !== original.environment) {
      return { ok: false, reason: "invalid_metadata", message: `Metadados do lugar ${place.code} nao conferem com o catalogo oficial.` };
    }
    if (
      !Number.isInteger(place.x) ||
      !Number.isInteger(place.y) ||
      place.x < 0 ||
      place.x > OFFICIAL_TABLE_MAP_WIDTH ||
      place.y < 0 ||
      place.y > OFFICIAL_TABLE_MAP_HEIGHT
    ) {
      return { ok: false, reason: "invalid_coordinate", message: `Coordenada invalida no lugar ${place.code}.` };
    }
  }

  return null;
}

export async function regenerateOfficialTableMapPreviews(places: readonly OfficialTableMapPlace[]) {
  await mkdir(previewDir, { recursive: true });

  const cases: Array<[string, readonly string[]]> = [
    ["todos-disponiveis.webp", []],
    ["alguns-indisponiveis.webp", unavailableSample],
    ["todos-indisponiveis.webp", places.map((place) => place.code)],
  ];
  const previews: string[] = [];

  for (const [filename, unavailableCodes] of cases) {
    const rendered = await renderOfficialTableMap({ places, unavailableCodes });
    const targetPath = path.join(previewDir, filename);
    await writeFile(targetPath, rendered.buffer);
    previews.push(targetPath);
  }

  return previews;
}

export async function persistOfficialTableMapPlaces(input: unknown): Promise<PersistOfficialPlacesResult> {
  const places = normalizePlaces(input);
  const validation = validatePlaces(places);
  if (validation) return validation;
  if (!places) {
    return { ok: false, reason: "invalid_count", message: "Quantidade de lugares diferente do catalogo oficial." };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("official_table_map_places")
      .upsert(
        places.map((place) => ({ code: place.code, x: place.x, y: place.y })),
        { onConflict: "code" },
      )
      .select("code");

    if (error) {
      return {
        ok: false,
        reason: "database_error",
        message: "Supabase recusou salvar as coordenadas do mapa.",
        details: getErrorMessage(error),
      };
    }

    if (!data || data.length !== places.length) {
      return {
        ok: false,
        reason: "database_error",
        message: "Supabase nao confirmou todas as coordenadas salvas.",
        details: `confirmadas ${data?.length ?? 0} de ${places.length}`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      reason: "database_error",
      message: "Nao foi possivel salvar as coordenadas no banco.",
      details: getErrorMessage(error),
    };
  }

  let savedPlaces: OfficialTableMapPlace[];
  try {
    savedPlaces = await getOfficialTableMapPlaces();
  } catch (error) {
    return {
      ok: false,
      reason: "database_error",
      message: "As coordenadas foram enviadas, mas a leitura de confirmacao falhou.",
      details: getErrorMessage(error),
    };
  }
  const savedValidation = validatePlaces(savedPlaces);
  if (savedValidation) return savedValidation;

  let previews: string[] = [];
  if (process.env.NODE_ENV !== "production") {
    previews = await regenerateOfficialTableMapPreviews(savedPlaces);
  }

  return { ok: true, places: [...savedPlaces], previews };
}
