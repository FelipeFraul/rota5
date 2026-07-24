import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const eventCardPath = new URL("../src/app/admin/eventos/components/AdminEventCard.tsx", import.meta.url);
const eventGridPath = new URL("../src/app/admin/eventos/components/AdminEventGrid.tsx", import.meta.url);
const comboCardPath = new URL("../src/app/admin/eventos/components/AdminComboOfferCard.tsx", import.meta.url);
const comboGridPath = new URL("../src/app/admin/eventos/components/AdminComboOfferGrid.tsx", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("AdminEventsEditor delegates event and combo lists to memoized grids", async () => {
  const editor = await source(editorPath);

  assert.match(editor, /import AdminComboOfferGrid, \{ type AdminComboOfferCardItem \}/);
  assert.match(editor, /import AdminEventGrid, \{ type AdminEventCardItem \}/);
  assert.match(editor, /const eventCardItems = useMemo<AdminEventCardItem\[\]>/);
  assert.match(editor, /const comboOfferCardItems = useMemo<AdminComboOfferCardItem\[\]>/);
  assert.match(editor, /const handleOpenEvent = useCallback/);
  assert.match(editor, /const handleDuplicateEvent = useCallback/);
  assert.match(editor, /const handleDeleteEvent = useCallback/);
  assert.match(editor, /const handleOpenDashboard = useCallback/);
  assert.match(editor, /const handleOpenComboOffer = useCallback/);
  assert.match(editor, /const handleDuplicateComboOffer = useCallback/);
  assert.match(editor, /const handleDeleteComboOffer = useCallback/);
  assert.match(editor, /<AdminEventGrid/);
  assert.match(editor, /<AdminComboOfferGrid/);
  assert.doesNotMatch(editor, /events\.map\(\(event\) => \(\s*<article/);
  assert.doesNotMatch(editor, /comboOffers\.map\(\(offer\) => \(\s*<article/);
});

test("event card and grid preserve all listing actions", async () => {
  const card = await source(eventCardPath);
  const grid = await source(eventGridPath);

  assert.match(card, /memo\(AdminEventCardComponent\)/);
  assert.match(grid, /memo\(AdminEventGridComponent\)/);
  assert.match(card, /aria-label=\{`Editar \$\{title\}`\}/);
  assert.match(card, /aria-label=\{`Duplicar \$\{title\}`\}/);
  assert.match(card, /aria-label=\{`Dashboard de \$\{title\}`\}/);
  assert.match(card, /aria-label=\{`Excluir \$\{title\}`\}/);
  assert.match(card, /onOpen\(eventId\)/);
  assert.match(card, /onDuplicate\(eventId\)/);
  assert.match(card, /onOpenDashboard\(eventId\)/);
  assert.match(card, /onDelete\(eventId\)/);
  assert.match(card, /TicketSalesOverviewIcons/);
  assert.match(card, /ticketImpressions/);
  assert.match(card, /ticketClicks/);
  assert.match(grid, /duplicatingEventId === event\.eventId/);
});

test("combo card and grid preserve edit, duplicate, delete and metrics", async () => {
  const card = await source(comboCardPath);
  const grid = await source(comboGridPath);

  assert.match(card, /memo\(AdminComboOfferCardComponent\)/);
  assert.match(grid, /memo\(AdminComboOfferGridComponent\)/);
  assert.match(card, /aria-label=\{`Editar combo \$\{name\}`\}/);
  assert.match(card, /aria-label=\{`Duplicar combo \$\{name\}`\}/);
  assert.match(card, /aria-label=\{`Dashboard do combo \$\{name\}`\}/);
  assert.match(card, /aria-label=\{`Excluir combo \$\{name\}`\}/);
  assert.match(card, /onEdit\(offerId\)/);
  assert.match(card, /onDuplicate\(offerId\)/);
  assert.match(card, /onDelete\(offerId\)/);
  assert.match(card, /Prioridade/);
  assert.match(card, /itemsSold/);
  assert.match(card, /revenueCents/);
  assert.match(card, /impressions/);
  assert.match(card, /clicks/);
  assert.match(grid, /actionId === offer\.offerId/);
});

test("list refresh remains wired after save, duplicate, delete, publish, pause and combo changes", async () => {
  const editor = await source(editorPath);

  assert.match(editor, /async function persistDraft\(\)[\s\S]*await loadEvents\(\);/);
  assert.match(editor, /async function saveComboOffer\(event[\s\S]*await loadEvents\(\);[\s\S]*loadComboOffers\(\{ force: true \}\)/);
  assert.match(editor, /const duplicateComboOfferCard = useCallback[\s\S]*await loadEvents\(\);[\s\S]*await loadComboOffers\(\{ force: true \}\)/);
  assert.match(editor, /const deleteComboOfferCard = useCallback[\s\S]*await loadEvents\(\);[\s\S]*await loadComboOffers\(\{ force: true \}\)/);
  assert.match(editor, /const deleteEvent = useCallback[\s\S]*await loadEvents\(\);/);
  assert.match(editor, /const duplicateEvent = useCallback[\s\S]*await loadEvents\(\);/);
  assert.match(editor, /<select value=\{draft\.event\.status\}/);
  assert.match(editor, /<option value="published">Publicado<\/option>/);
  assert.match(editor, /<option value="draft">Pausado<\/option>/);
});
