import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const editorPath = new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url);
const routePath = new URL("../src/app/api/admin/events/[eventId]/route.ts", import.meta.url);

test("admin price ticket label remains independently editable", async () => {
  const editor = await readFile(editorPath, "utf8");
  const route = await readFile(routePath, "utf8");

  assert.match(
    editor,
    /Nome no ingresso<input value=\{price\.label\} onChange=/,
    "O campo Nome no ingresso precisa aceitar edicao no modal de precos.",
  );
  assert.doesNotMatch(
    editor,
    /Nome no ingresso<input value=\{price\.label\} readOnly/,
    "O campo Nome no ingresso nao pode ficar travado como somente leitura.",
  );
  assert.doesNotMatch(
    editor,
    /\.\.\.price,\s*sectionName,\s*label:\s*sectionName/,
    "Sincronizar nome do setor nao pode sobrescrever o nome do ingresso.",
  );
  assert.match(
    route,
    /updateAdminPrice\(price\.priceId,\s*\{\s*label:\s*price\.label,/s,
    "O PATCH do evento deve salvar o label enviado pelo formulario.",
  );
  assert.doesNotMatch(
    route,
    /label:\s*updatedSectionNameById\.get/,
    "O PATCH do evento nao pode substituir o label pelo nome atualizado do setor.",
  );
});
