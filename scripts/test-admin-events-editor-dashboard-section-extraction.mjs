import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const sectionPath = new URL("../src/app/admin/eventos/dashboard/AdminDashboardSection.tsx", import.meta.url);
const generalDashboardPath = new URL("../src/app/admin/eventos/dashboard/GeneralDashboardModal.tsx", import.meta.url);
const routePath = new URL("../src/app/api/admin/events/route.ts", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("AdminEventsEditor delegates dashboard UI and keeps only selected dashboard id", async () => {
  const editor = await source(editorPath);

  assert.match(editor, /const AdminDashboardSection = dynamic\(\(\) => import\("\.\/dashboard\/AdminDashboardSection"\)/);
  assert.match(editor, /const \[dashboardEventId, setDashboardEventId\] = useState<string \| null>\(null\)/);
  assert.match(editor, /<AdminDashboardSection/);
  assert.match(editor, /event=\{dashboardEventId \? eventsById\.get\(dashboardEventId\) \?\? null : null\}/);
  assert.match(editor, /onCloseEventDashboard=\{handleCloseDashboard\}/);
  assert.doesNotMatch(editor, /const \[generalDashboard, setGeneralDashboard\]/);
  assert.doesNotMatch(editor, /generalDashboard=\{generalDashboard\}/);
  assert.doesNotMatch(editor, /const \[dashboard, setDashboard\]/);
  assert.doesNotMatch(editor, /const \[contactsOpen, setContactsOpen\]/);
  assert.doesNotMatch(editor, /const \[generalDashboardOpen, setGeneralDashboardOpen\]/);
  assert.doesNotMatch(editor, /eventDashboardRangeLoading/);
  assert.doesNotMatch(editor, /EventDashboardModal/);
  assert.doesNotMatch(editor, /ContactsModal/);
  assert.doesNotMatch(editor, /GeneralDashboardModal/);
  assert.doesNotMatch(editor, /dashboard=1/);
});

test("AdminDashboardSection owns general dashboard, event dashboard, contacts and fetches", async () => {
  const section = await source(sectionPath);

  assert.match(section, /const AdminDashboardSection = memo\(AdminDashboardSectionComponent\)/);
  assert.match(section, /const EventDashboardModal = dynamic/);
  assert.match(section, /const GeneralDashboardModal = dynamic/);
  assert.match(section, /const ContactsModal = dynamic/);
  assert.match(section, /const \[dashboard, setDashboard\] = useState<DashboardState \| null>\(null\)/);
  assert.match(section, /const \[generalDashboard, setGeneralDashboard\] = useState<GeneralDashboard \| null>\(null\)/);
  assert.match(section, /const \[generalDashboardOpen, setGeneralDashboardOpen\] = useState\(false\)/);
  assert.match(section, /const \[generalDashboardLoading, setGeneralDashboardLoading\] = useState\(false\)/);
  assert.match(section, /const \[generalContactActivityByRange, setGeneralContactActivityByRange\]/);
  assert.match(section, /const \[generalContactsLoadingRange, setGeneralContactsLoadingRange\]/);
  assert.match(section, /const \[contactsOpen, setContactsOpen\] = useState\(false\)/);
  assert.match(section, /fetch\("\/api\/admin\/events\?generalDashboard=1"/);
  assert.match(section, /fetch\(`\/api\/admin\/events\?contacts=1&range=\$\{range\}`/);
  assert.match(section, /if \(generalContactActivityByRange\[range\] \|\| generalContactsLoadingRange === range\) return/);
  assert.match(section, /day: result\.dashboard!\.contactActivity/);
  assert.match(section, /fetch\(`\/api\/admin\/events\/\$\{selectedEvent\.eventId\}\?dashboard=1`/);
  assert.match(section, /fetch\(`\/api\/admin\/events\/\$\{dashboard\.event\.eventId\}\?dashboard=1&range=\$\{range\}`/);
  assert.match(section, /<GeneralDashboardCards/);
  assert.match(section, /<EventDashboardModal/);
  assert.match(section, /<ContactsModal/);
  assert.match(section, /<GeneralDashboardModal/);
  assert.match(section, /contactActivityByRange=\{generalContactActivityByRange\}/);
  assert.match(section, /contactsLoadingRange=\{generalContactsLoadingRange\}/);
  assert.match(section, /onLoadContacts=\{loadGeneralContacts\}/);
});

test("dashboard callbacks are memoized and errors flow back to the editor", async () => {
  const section = await source(sectionPath);

  assert.match(section, /const openGeneralDashboard = useCallback/);
  assert.match(section, /const closeGeneralDashboard = useCallback/);
  assert.match(section, /const openContacts = useCallback/);
  assert.match(section, /const closeContacts = useCallback/);
  assert.match(section, /const closeEventDashboard = useCallback/);
  assert.match(section, /const changeEventDashboardRange = useCallback/);
  assert.match(section, /const loadGeneralContacts = useCallback/);
  assert.match(section, /if \(generalDashboard \|\| generalDashboardLoading\) return/);
  assert.match(section, /onError\(result\.message \?\? "Não foi possível atualizar o período\."\)/);
});

test("general contacts are cached by range outside the modal", async () => {
  const modal = await source(generalDashboardPath);

  assert.match(modal, /contactActivityByRange/);
  assert.match(modal, /contactsLoadingRange/);
  assert.match(modal, /onLoadContacts/);
  assert.match(modal, /if \(!contactActivityByRange\[range\]\) onLoadContacts\(range\)/);
  assert.doesNotMatch(modal, /fetch\(`\/api\/admin\/events\?contacts=1&range=\$\{range\}`/);
});

test("general dashboard has a dedicated lazy endpoint", async () => {
  const route = await source(routePath);

  assert.match(route, /url\.searchParams\.get\("generalDashboard"\) === "1"/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, dashboard \}\)/);
});
