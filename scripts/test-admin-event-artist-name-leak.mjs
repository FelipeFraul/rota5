import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);
const adminEventsService = readFileSync(
  new URL("../src/lib/tickets/services/adminEvents.ts", import.meta.url),
  "utf8",
);
const adminEventRoute = readFileSync(
  new URL("../src/app/api/admin/events/[eventId]/route.ts", import.meta.url),
  "utf8",
);
const eventEditorModal = readFileSync(
  new URL("../src/app/admin/eventos/event-editor/EventEditorModal.tsx", import.meta.url),
  "utf8",
);

const dependentKeys = {
  title: [
    "artistName",
    "city",
    "state",
    "venueName",
    "imageUrl",
    "expectedDateCount",
    "sessionsPerDate",
    "expectedSessionCount",
    "currentSessionDateIndex",
    "currentSessionTimeIndex",
    "eventDates",
    "pendingSessionDate",
    "sessionsStartsAt",
    "entryModel",
    "entryCapacityMode",
    "entryCapacityModeConfirmed",
    "sharedEntryCapacity",
    "expectedEntryCount",
    "currentEntryIndex",
    "sharedPriceOptions",
    "initialSections",
    "pendingNumberedSection",
    "description",
    "status",
    "returnToCreateStatus",
    "lastVenues",
  ],
  artistName: [
    "city",
    "state",
    "venueName",
    "imageUrl",
    "expectedDateCount",
    "sessionsPerDate",
    "expectedSessionCount",
    "currentSessionDateIndex",
    "currentSessionTimeIndex",
    "eventDates",
    "pendingSessionDate",
    "sessionsStartsAt",
    "entryModel",
    "entryCapacityMode",
    "entryCapacityModeConfirmed",
    "sharedEntryCapacity",
    "expectedEntryCount",
    "currentEntryIndex",
    "sharedPriceOptions",
    "initialSections",
    "pendingNumberedSection",
    "description",
    "status",
    "returnToCreateStatus",
    "lastVenues",
  ],
};

function resetCreateEventDraftFromField(draft, field) {
  const nextDraft = { ...draft };
  for (const key of dependentKeys[field] ?? []) {
    delete nextDraft[key];
  }
  nextDraft.field = field;
  return nextDraft;
}

test("novo evento inicia com draft limpo somente no campo title", () => {
  assert.match(router, /draft:\s*\{\s*field:\s*"title"\s*\}/);
});

test("voltar para titulo remove artistName e campos textuais posteriores", () => {
  const previousDraft = {
    field: "city",
    title: "JAIR BLOCH - O SHOWMAN",
    artistName: "JAIR BLOCH",
    city: "Itapetininga",
    state: "SP",
    venueName: "Rock Bar Pub",
    imageUrl: "https://example.com/foto.jpg",
    description: "Texto anterior",
  };
  const nextDraft = resetCreateEventDraftFromField(previousDraft, "title");

  assert.deepEqual(nextDraft, {
    field: "title",
    title: "JAIR BLOCH - O SHOWMAN",
  });
});

test("repreencher titulo antes de avancar limpa artistName antigo", () => {
  const draft = {
    field: "title",
    title: "DEEP ILLUSIONS",
    artistName: "JAIR BLOCH",
    city: "Itapetininga",
  };
  const nextDraft = resetCreateEventDraftFromField(draft, "title");
  nextDraft.title = draft.title;
  nextDraft.field = "artistName";

  assert.equal(nextDraft.title, "DEEP ILLUSIONS");
  assert.equal(nextDraft.field, "artistName");
  assert.equal("artistName" in nextDraft, false);
  assert.equal("city" in nextDraft, false);
});

test("artistName vazio e aceito na criacao sem reutilizar ultimo evento", () => {
  assert.match(router, /draft\[field\]\s*=\s*\["pular", "sem", "nenhum", "nao"/);
  assert.doesNotMatch(router, /!\s*artistName\s*\|\|/);
  assert.match(adminEventsService, /artistName\?: string \| null/);
  assert.match(adminEventsService, /const title = input\.title\.trim\(\)/);
  assert.match(adminEventsService, /const artistName = input\.artistName\?\.trim\(\) \|\| title/);
  assert.match(adminEventsService, /artist_name: artistName/);
});

test("edicao permite limpar artistName sem usar fallback do ultimo evento", () => {
  assert.match(adminEventRoute, /artistName: z\.string\(\)\.trim\(\)\.max\(160\)\.nullable\(\)\.optional\(\)/);
  assert.match(adminEventRoute, /artist_name: parsed\.data\.event\.artistName\?\.trim\(\) \|\| parsed\.data\.event\.title/);
});

test("duplicacao explicita nao herda artist_name do evento origem", () => {
  assert.match(adminEventsService, /export async function duplicateAdminEvent/);
  assert.match(adminEventsService, /const duplicatedTitle = `\$\{sourceEvent\.title\} - C/);
  assert.match(adminEventsService, /artist_name: duplicatedTitle/);
  assert.doesNotMatch(adminEventsService, /artist_name: sourceEvent\.artist_name/);
});

test("editor sincroniza artista com titulo enquanto artista ainda espelha titulo", () => {
  assert.match(eventEditorModal, /function updateDraftEventTitle/);
  assert.match(eventEditorModal, /draft\.event\.artistName\.trim\(\) === draft\.event\.title\.trim\(\)/);
  assert.match(eventEditorModal, /setDraft\(updateDraftEventTitle\(draft, event\.target\.value\)\)/);
});
