import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const sectionPath = new URL("../src/app/admin/eventos/combo-editor/AdminComboOffersSection.tsx", import.meta.url);
const modalPath = new URL("../src/app/admin/eventos/combo-editor/ComboOfferModal.tsx", import.meta.url);
const comboOffersApiPath = new URL("../src/app/api/admin/combo-offers/route.ts", import.meta.url);
const comboOfferPatchApiPath = new URL("../src/app/api/admin/combo-offers/[offerId]/route.ts", import.meta.url);
const comboOfferCronPath = new URL("../src/lib/tickets/comboOfferCron.ts", import.meta.url);
const vercelConfigPath = new URL("../vercel.json", import.meta.url);

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

test("combo custom timing follows cron minimum window and says after purchase", async () => {
  const [section, modal, comboOffersApi, comboOfferPatchApi, comboOfferCron, vercelConfig] = await Promise.all([
    source(sectionPath),
    source(modalPath),
    source(comboOffersApiPath),
    source(comboOfferPatchApiPath),
    source(comboOfferCronPath),
    source(vercelConfigPath),
  ]);
  const config = JSON.parse(vercelConfig);
  const expireReservationCron = config.crons.find((cron) => cron.path === "/api/cron/expire-reservations");

  assert.equal(expireReservationCron?.schedule, "* * * * *");
  assert.match(comboOfferCron, /COMBO_OFFER_CRON_WINDOW_MINUTES = 1/);
  assert.match(comboOfferCron, /formatComboOfferAfterPurchaseTiming/);
  assert.match(comboOfferCron, /apos compra/);
  assert.doesNotMatch(comboOfferCron, /\bantes\b/);
  assert.match(section, /formatComboOfferAfterPurchaseTiming\(customOffsetMinutes\)/);
  assert.match(modal, /min=\{minimumCustomOffsetMinutes\}/);
  assert.match(modal, /normalizeComboOfferCustomOffsetMinutes\(Number\(event\.target\.value\)\)/);
  assert.match(modal, /min apos compra/);
  assert.match(comboOffersApi, /formatComboOfferAfterPurchaseTiming\(Number\(offer\.send_offset_minutes \?\? 0\)\)/);
  assert.match(comboOfferPatchApi, /payload\.customOffsetMinutes >= getMinimumComboOfferCustomOffsetMinutes\(\)/);
});
