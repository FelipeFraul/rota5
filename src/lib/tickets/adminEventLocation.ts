export type AdminEventLocationField = "venue" | "city" | "state";

export type AdminEventLocationSnapshot = {
  venueName: string;
  city: string;
  state: string;
};

export type AdminEventLocationFailureReason =
  | "multi_venue_unsupported"
  | "requires_remap"
  | "database_error";

function normalizeLocationPart(value: string, upper = false) {
  const normalized = value.trim();
  return upper ? normalized.toUpperCase() : normalized.toLocaleLowerCase("pt-BR");
}

export function isAdminEventLocationUnchanged(
  current: AdminEventLocationSnapshot,
  next: AdminEventLocationSnapshot,
) {
  return normalizeLocationPart(current.venueName) === normalizeLocationPart(next.venueName)
    && normalizeLocationPart(current.city) === normalizeLocationPart(next.city)
    && normalizeLocationPart(current.state, true) === normalizeLocationPart(next.state, true);
}

export function buildAdminEventLocationChange(
  field: AdminEventLocationField,
  value: string,
  current: AdminEventLocationSnapshot,
): AdminEventLocationSnapshot {
  return {
    venueName: (field === "venue" ? value : current.venueName).trim(),
    city: (field === "city" ? value : current.city).trim(),
    state: (field === "state" ? value : current.state).trim().toUpperCase(),
  };
}

export function adminEventLocationBlockMessage(reason: AdminEventLocationFailureReason) {
  if (reason === "multi_venue_unsupported") {
    return "Este evento possui sessões em locais diferentes. A localização não pode ser alterada por este editor sem um remapeamento explícito.";
  }
  if (reason === "requires_remap") {
    return "O local, a cidade ou a UF não pode ser alterado enquanto houver setores, preços, assentos, cortesias, reservas ou ingressos vinculados. É necessário remapear essa estrutura.";
  }
  return null;
}
