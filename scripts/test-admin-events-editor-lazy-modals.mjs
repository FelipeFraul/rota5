import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const comboSectionPath = new URL("../src/app/admin/eventos/combo-editor/AdminComboOffersSection.tsx", import.meta.url);
const dashboardSectionPath = new URL("../src/app/admin/eventos/dashboard/AdminDashboardSection.tsx", import.meta.url);
const eventEditorPath = new URL("../src/app/admin/eventos/event-editor/EventEditorModal.tsx", import.meta.url);
const comboPath = new URL("../src/app/admin/eventos/combo-editor/ComboOfferModal.tsx", import.meta.url);
const eventDashboardPath = new URL("../src/app/admin/eventos/dashboard/EventDashboardModal.tsx", import.meta.url);
const generalDashboardPath = new URL("../src/app/admin/eventos/dashboard/GeneralDashboardModal.tsx", import.meta.url);
const contactsPath = new URL("../src/app/admin/eventos/contacts/ContactsModal.tsx", import.meta.url);
const tableMapPath = new URL("../src/app/admin/eventos/event-editor/EventTableMapTab.tsx", import.meta.url);
const feedbackPath = new URL("../src/app/admin/eventos/components/SaveFeedbackOverlay.tsx", import.meta.url);

test("AdminEventsEditor lazy-loads extracted modals and table map", async () => {
  const [source, comboSection, dashboardSection, eventEditor] = await Promise.all([
    readFile(editorPath, "utf8"),
    readFile(comboSectionPath, "utf8"),
    readFile(dashboardSectionPath, "utf8"),
    readFile(eventEditorPath, "utf8"),
  ]);

  assert.match(source, /dynamic\(\(\) => import\("\.\/combo-editor\/AdminComboOffersSection"\)/);
  assert.match(source, /dynamic\(\(\) => import\("\.\/dashboard\/AdminDashboardSection"\)/);
  assert.match(source, /dynamic\(\(\) => import\("\.\/event-editor\/EventEditorModal"\)/);
  assert.match(comboSection, /dynamic\(\(\) => import\("\.\/ComboOfferModal"\)/);
  assert.match(comboSection, /dynamic\(\(\) => import\("\.\.\/components\/SaveFeedbackOverlay"\)/);
  assert.match(dashboardSection, /dynamic\(\(\) => import\("\.\/EventDashboardModal"\)/);
  assert.match(dashboardSection, /dynamic\(\(\) => import\("\.\/GeneralDashboardModal"\)/);
  assert.match(dashboardSection, /dynamic\(\(\) => import\("\.\.\/contacts\/ContactsModal"\)/);
  assert.match(eventEditor, /dynamic\(\(\) => import\("\.\/EventTableMapTab"\)/);

  assert.doesNotMatch(source, /from "@\/app\/admin\/AdminTableMapCalibrator"/);
  assert.doesNotMatch(source, /from "@\/lib\/tickets\/tableMap\/officialPlaces"/);
  assert.doesNotMatch(source, /function GeneralDashboardModal/);
  assert.doesNotMatch(source, /function ContactsModal/);
  assert.doesNotMatch(source, /function ConversationModal/);
});

test("lazy modules keep expected modal behavior surfaces", async () => {
  const [combo, eventDashboard, generalDashboard, contacts, tableMap, feedback] = await Promise.all([
    readFile(comboPath, "utf8"),
    readFile(eventDashboardPath, "utf8"),
    readFile(generalDashboardPath, "utf8"),
    readFile(contactsPath, "utf8"),
    readFile(tableMapPath, "utf8"),
    readFile(feedbackPath, "utf8"),
  ]);

  assert.match(combo, /onSubmit=\{onSubmit\}/);
  assert.match(combo, /Salvar combo/);
  assert.match(combo, /onDraftChange/);

  assert.match(eventDashboard, /aria-label="Dashboard do evento"/);
  assert.match(eventDashboard, /onRangeChange/);
  assert.match(eventDashboard, /ContactActivitySection/);

  assert.match(generalDashboard, /aria-label="Geral de todos os eventos"/);
  assert.match(generalDashboard, /onLoadContacts/);
  assert.doesNotMatch(generalDashboard, /api\/admin\/events\?contacts=1&range=/);
  assert.match(generalDashboard, /ContactsModal/);

  assert.match(contacts, /function ConversationModal/);
  assert.match(contacts, /Ver conversa/);
  assert.match(contacts, /aria-label=\{title\}/);

  assert.match(tableMap, /AdminTableMapCalibrator/);
  assert.match(tableMap, /OFFICIAL_TABLE_MAP_PLACES/);

  assert.match(feedback, /admin-save-feedback-modal/);
  assert.match(feedback, /feedback\.state/);
});
