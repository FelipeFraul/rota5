import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const modalPath = new URL("../src/app/admin/eventos/event-editor/EventEditorModal.tsx", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("AdminEventsEditor keeps only event id and delegates editing to EventEditorModal", async () => {
  const editor = await source(editorPath);

  assert.match(editor, /const EventEditorModal = dynamic\(\(\) => import\("\.\/event-editor\/EventEditorModal"\)/);
  assert.match(editor, /const \[editingEventId, setEditingEventId\] = useState<string \| null>\(null\)/);
  assert.match(editor, /<EventEditorModal/);
  assert.match(editor, /eventId=\{editingEventId\}/);
  assert.match(editor, /onSaved=\{loadEvents\}/);
  assert.doesNotMatch(editor, /const \[selected, setSelected\]/);
  assert.doesNotMatch(editor, /const \[draft, setDraft\]/);
  assert.doesNotMatch(editor, /const \[saving, setSaving\]/);
  assert.doesNotMatch(editor, /const \[activeTab, setActiveTab\]/);
  assert.doesNotMatch(editor, /function buildDraft/);
  assert.doesNotMatch(editor, /function syncDraftWithSections/);
  assert.doesNotMatch(editor, /onSubmit=\{saveEvent\}/);
});

test("EventEditorModal owns draft, tabs, field handlers and event saving", async () => {
  const modal = await source(modalPath);

  assert.match(modal, /const \[selected, setSelected\] = useState<EventDetails \| null>\(null\)/);
  assert.match(modal, /const \[draft, setDraft\] = useState<Draft \| null>\(null\)/);
  assert.match(modal, /const \[saving, setSaving\] = useState\(false\)/);
  assert.match(modal, /const \[activeTab, setActiveTab\] = useState<ActiveTab>\("event"\)/);
  assert.match(modal, /function buildDraft/);
  assert.match(modal, /function syncDraftWithSections/);
  assert.match(modal, /function createNewSectionDraft/);
  assert.match(modal, /function changeTab/);
  assert.match(modal, /async function saveEvent/);
  assert.match(modal, /method: "PATCH"/);
  assert.match(modal, /body: JSON\.stringify\(draft\)/);
});

test("EventEditorModal covers event, session, section, price, courtesy and table map editing", async () => {
  const modal = await source(modalPath);

  assert.match(modal, /<button type="button" className=\{activeTab === "event"/);
  assert.match(modal, /<button type="button" className=\{activeTab === "sessions"/);
  assert.match(modal, /<button type="button" className=\{activeTab === "sections"/);
  assert.match(modal, /<button type="button" className=\{activeTab === "prices"/);
  assert.match(modal, /<button type="button" className=\{activeTab === "courtesy"/);
  assert.match(modal, /<button type="button" className=\{activeTab === "tableMap"/);
  assert.match(modal, /value=\{draft\.event\.title\}/);
  assert.match(modal, /draft\.sessions\.map/);
  assert.match(modal, /draft\.sections\.map/);
  assert.match(modal, /draft\.prices\.map/);
  assert.match(modal, /draft\.courtesy\.sections\.map/);
  assert.match(modal, /<EventTableMapTab \/>/);
});

test("saving an event refreshes only events and closing without saving does not mutate list state", async () => {
  const editor = await source(editorPath);
  const modal = await source(modalPath);

  assert.match(modal, /await onSaved\(\);/);
  assert.match(modal, /onClose\(\);/);
  assert.doesNotMatch(modal, /loadComboOffers/);
  assert.doesNotMatch(editor, /onSaved=\{.*loadComboOffers/s);
  assert.match(editor, /onClose=\{\(\) => setEditingEventId\(null\)\}/);
  assert.doesNotMatch(editor, /setEvents\([^)]*draft/);
});
