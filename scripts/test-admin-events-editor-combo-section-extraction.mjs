import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const sectionPath = new URL("../src/app/admin/eventos/combo-editor/AdminComboOffersSection.tsx", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("AdminEventsEditor delegates combos and keeps no combo state or fetches", async () => {
  const editor = await source(editorPath);

  assert.match(editor, /const AdminComboOffersSection = dynamic\(\(\) => import\("\.\/combo-editor\/AdminComboOffersSection"\)/);
  assert.match(editor, /const \[comboSectionMounted, setComboSectionMounted\] = useState\(false\)/);
  assert.match(editor, /if \(nextViewFilter !== "tickets"\) setComboSectionMounted\(true\)/);
  assert.match(editor, /comboSectionMounted \? \(\s*<AdminComboOffersSection events=\{events\} visible=\{viewFilter !== "tickets"\} \/>/);
  assert.doesNotMatch(editor, /const \[comboOffers/);
  assert.doesNotMatch(editor, /const \[comboOffersLoaded/);
  assert.doesNotMatch(editor, /const \[comboLoading/);
  assert.doesNotMatch(editor, /const \[selectedComboOffer/);
  assert.doesNotMatch(editor, /const \[comboDraft/);
  assert.doesNotMatch(editor, /const \[comboSaving/);
  assert.doesNotMatch(editor, /const \[comboActionId/);
  assert.doesNotMatch(editor, /loadComboOffers/);
  assert.doesNotMatch(editor, /\/api\/admin\/combo-offers/);
  assert.doesNotMatch(editor, /<ComboOfferModal/);
});

test("AdminComboOffersSection lazy-loads combos and owns editor actions", async () => {
  const section = await source(sectionPath);

  assert.match(section, /const \[comboOffers, setComboOffers\] = useState<ComboOfferSummary\[\]>\(\[\]\)/);
  assert.match(section, /const \[comboOffersLoaded, setComboOffersLoaded\] = useState\(false\)/);
  assert.match(section, /const \[comboLoading, setComboLoading\] = useState\(false\)/);
  assert.match(section, /const \[selectedComboOffer, setSelectedComboOffer\] = useState<ComboOfferSummary \| null>\(null\)/);
  assert.match(section, /const \[comboDraft, setComboDraft\] = useState<ComboOfferDraft \| null>\(null\)/);
  assert.match(section, /fetch\("\/api\/admin\/combo-offers"/);
  assert.match(section, /if \(!options\?\.force && comboOffersLoaded\) return/);
  assert.match(section, /useEffect\(\(\) => \{[\s\S]*void loadComboOffers\(\);[\s\S]*window\.clearTimeout\(timeout\)/);
  assert.match(section, /<section hidden=\{!visible\}>/);
  assert.match(section, /<ComboOfferModal/);
  assert.match(section, /<AdminComboOfferGrid/);
});

test("combo save, duplicate and delete do not request events and update local list", async () => {
  const section = await source(sectionPath);

  assert.doesNotMatch(section, /loadEvents/);
  assert.doesNotMatch(section, /\/api\/admin\/events/);
  assert.match(section, /method: "PATCH"[\s\S]*setComboOffers\(\(current\) => current\.map/);
  assert.match(section, /method: "POST"[\s\S]*setComboOffers\(\(current\) => \[buildDuplicatedOffer\(offer, result\.offerId!\), \.\.\.current\]\)/);
  assert.match(section, /method: "DELETE"[\s\S]*setComboOffers\(\(current\) => current\.filter/);
  assert.doesNotMatch(section, /loadComboOffers\(\{ force: true \}\)/);
});

test("combo errors, close without saving and metrics/list fields are preserved", async () => {
  const section = await source(sectionPath);

  assert.match(section, /Não foi possível carregar os combos\./);
  assert.match(section, /Não foi possível salvar o combo\./);
  assert.match(section, /Não foi possível duplicar o combo\./);
  assert.match(section, /Não foi possível excluir o combo\./);
  assert.match(section, /onClose=\{\(\) => \{\s*setSelectedComboOffer\(null\);\s*setComboDraft\(null\);/);
  assert.match(section, /itemsSold: offer\.itemsSold/);
  assert.match(section, /revenueCents: offer\.revenueCents/);
  assert.match(section, /impressions: offer\.impressions/);
  assert.match(section, /clicks: offer\.clicks/);
});
