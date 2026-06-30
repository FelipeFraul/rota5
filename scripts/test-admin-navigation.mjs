import assert from "node:assert/strict";
import { reconcileAdminNavigation } from "../src/lib/tickets/adminNavigation.ts";

const admin = {
  adminUserId: "admin",
  role: "root",
  sessionId: "session",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function context(state, marker, extra = {}) {
  return {
    step: state,
    state,
    admin,
    marker,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

function transition(currentContext, inboundText, state, marker, reply, extra = {}) {
  return reconcileAdminNavigation({
    currentContext,
    inboundText,
    routeResult: {
      reply,
      nextContext: context(state, marker, extra),
    },
  });
}

let result = transition(context("idle", 0), "123456", "admin_menu", 1, "TELA 1");
result = transition(result.nextContext, "1", "admin_events_menu", 2, "TELA 2");
result = transition(result.nextContext, "1", "admin_events_list", 3, "TELA 3");
result = transition(result.nextContext, "1", "admin_event_detail", 4, "TELA 4");

result = transition(result.nextContext, "VOLTAR", "admin_events_list", 999, "RECONSTRUÇÃO ANTIGA");
assert.equal(result.reply, "TELA 3");
assert.equal(result.nextContext.marker, 3);

const branchPoint = result.nextContext;
result = transition(branchPoint, "2", "admin_event_edit_menu", 5, "NOVA TELA 4");
result = transition(result.nextContext, "voltar", "admin_events_list", 999, "ANTIGA");
assert.equal(result.reply, "TELA 3", "o ramo abandonado não reaparece");
assert.equal(result.nextContext.marker, 3);

result = transition(result.nextContext, "voltar", "admin_events_menu", 999, "ANTIGA");
assert.equal(result.reply, "TELA 2");
assert.equal(result.nextContext.marker, 2);

result = transition(result.nextContext, "voltar", "admin_menu", 999, "ANTIGA");
assert.equal(result.reply, "TELA 1");
assert.equal(result.nextContext.marker, 1);

result = transition(result.nextContext, "1", "admin_events_menu", 2, "TELA 2");
result = transition(result.nextContext, "menu", "admin_menu", 10, "NOVO MENU");
result = transition(result.nextContext, "voltar", "admin_menu", 11, "MENU NORMAL");
assert.equal(result.reply, "MENU NORMAL", "menu limpa o histórico anterior");
assert.equal(result.nextContext.marker, 11);

result = transition(context("admin_events_menu", 20), "2", "admin_event_create_collecting", 21, "CAMPO A", {
  adminEvents: { draft: { field: "title" } },
});
result = transition(result.nextContext, "Evento", "admin_event_create_collecting", 22, "CAMPO B", {
  adminEvents: { draft: { field: "artistName", title: "Evento" } },
});
result = transition(result.nextContext, "voltar", "admin_event_create_collecting", 999, "PROMPT ANTIGO", {
  adminEvents: { draft: { field: "title" } },
});
assert.equal(result.reply, "CAMPO A", "etapas com o mesmo state também voltam exatamente");
assert.equal(result.nextContext.marker, 21);

result = transition(
  context("admin_gate_password_collecting", 30),
  "segredo-super-secreto",
  "admin_gate_menu",
  31,
  "Senha cadastrada: segredo-super-secreto",
);
assert.equal(
  JSON.stringify(result.nextContext).includes("segredo-super-secreto"),
  false,
  "segredos não entram no histórico de navegação",
);

console.log("ok - navegação admin é LIFO, exata, limpa ramos e não persiste segredos");
