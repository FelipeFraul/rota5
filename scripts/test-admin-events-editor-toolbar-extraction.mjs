import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const toolbarPath = new URL("../src/app/admin/eventos/components/AdminEventsToolbar.tsx", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("AdminEventsEditor delegates toolbar and keeps only applied filters", async () => {
  const editor = await source(editorPath);

  assert.match(editor, /import AdminEventsToolbar from "\.\/components\/AdminEventsToolbar"/);
  assert.match(editor, /const \[appliedSearch, setAppliedSearch\] = useState\(""\)/);
  assert.match(editor, /const \[status, setStatus\] = useState<EventFilterStatus>\("published"\)/);
  assert.match(editor, /const \[viewFilter, setViewFilter\] = useState<AdminViewFilter>\("tickets"\)/);
  assert.match(editor, /<AdminEventsToolbar/);
  assert.match(editor, /onSearch=\{handleSearch\}/);
  assert.match(editor, /onRefreshSearch=\{handleRefreshSearch\}/);
  assert.match(editor, /onStatusChange=\{handleStatusChange\}/);
  assert.match(editor, /onViewFilterChange=\{handleViewFilterChange\}/);
  assert.doesNotMatch(editor, /const \[search, setSearch\]/);
  assert.doesNotMatch(editor, /placeholder="Buscar por nome, artista ou cidade"/);
  assert.doesNotMatch(editor, /className="admin-events-toolbar"/);
});

test("AdminEventsToolbar owns typed search, view buttons, status and counter", async () => {
  const toolbar = await source(toolbarPath);

  assert.match(toolbar, /const AdminEventsToolbar = memo\(AdminEventsToolbarComponent\)/);
  assert.match(toolbar, /const \[search, setSearch\] = useState\(appliedSearch\)/);
  assert.match(toolbar, /placeholder="Buscar por nome, artista ou cidade"/);
  assert.match(toolbar, /onRefreshSearch\(nextSearch\)/);
  assert.match(toolbar, /onSearch\(nextSearch\)/);
  assert.match(toolbar, /onStatusChange\(event\.target\.value as EventFilterStatus\)/);
  assert.match(toolbar, /onViewFilterChange\("tickets"\)/);
  assert.match(toolbar, /onViewFilterChange\("combos"\)/);
  assert.match(toolbar, /onViewFilterChange\("all"\)/);
  assert.match(toolbar, /data-event-count=\{eventCount\}/);
});

test("typing search cannot affect grids until submit applies search", async () => {
  const editor = await source(editorPath);
  const toolbar = await source(toolbarPath);

  assert.match(toolbar, /onChange=\{handleSearchChange\}/);
  assert.match(toolbar, /setSearch\(event\.target\.value\)/);
  assert.doesNotMatch(toolbar, /onSearch\(event\.target\.value/);
  assert.match(toolbar, /<form onSubmit=\{handleSubmit\}>/);
  assert.match(editor, /const handleSearch = useCallback\(\(nextSearch: string\) => \{\s*setAppliedSearch\(nextSearch\);/);
  assert.match(editor, /const handleRefreshSearch = useCallback\(\(nextSearch: string\) => \{\s*void loadEvents\(\{ search: nextSearch \}\);/);
  assert.match(editor, /<AdminEventGrid/);
  assert.match(editor, /<AdminComboOffersSection/);
});
