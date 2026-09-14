import assert from "node:assert/strict";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildApprovedCodexRequestBody,
  isAllowedCodexRequestPhone,
  parseCodexRequestCommand,
} from "../src/lib/tickets/codexRequests.ts";
import { createGitHubIssue } from "../src/lib/github/issues.ts";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

const json = (body, status = 200) => Response.json(body, { status });

async function loadMessages(getSupabaseAdmin) {
  return loadProductionModule("src/lib/tickets/services/messages.ts", {
    getSupabaseAdmin,
    formatWhatsAppUppercase: (value) => value,
    sanitizeWhatsAppText: (value) => value,
  });
}

async function loadRunner(adapters, writes = []) {
  globalThis.__codexRunnerAdapters = adapters;
  return loadProductionModule(
    "scripts/codex-local-runner.mjs",
    {
      spawn: () => { throw new Error("real spawn forbidden"); },
      spawnSync: (_command, args) => ({ status: 0, stdout: args?.includes("rev-parse") ? "abc123\n" : "", stderr: "" }),
      existsSync: () => false,
      mkdirSync: () => {}, readdirSync: () => [], readFileSync: () => "",
      writeFileSync: (_path, value) => writes.push(value), join, resolve,
      createClient: () => { throw new Error("real Supabase forbidden"); },
    },
    ["listPendingRequests", "extractPrompt", "buildCodexPrompt", "processRequest"],
    (source) => source
      .replace(/\nmain\(\)\.catch[\s\S]*$/m, "\n")
      .replace("await runCodex(request, prompt)", "await globalThis.__codexRunnerAdapters.runCodex(request, prompt)")
      .replace("await sendZapiText(phone, summary)", "await globalThis.__codexRunnerAdapters.sendZapiText(phone, summary)"),
  );
}

test("automation.request accepts only authorized commands and persists an inbound request once", async () => {
  const previous = process.env.CODEX_WHATSAPP_PHONES;
  process.env.CODEX_WHATSAPP_PHONES = "5515999999999";
  try {
    assert.deepEqual(parseCodexRequestCommand("CODEX: ajustar fluxo"), { prompt: "ajustar fluxo", isEmpty: false });
    assert.equal(isAllowedCodexRequestPhone("(15) 99999-9999"), true);
    assert.equal(isAllowedCodexRequestPhone("5515888888888"), false);
    assert.equal(buildApprovedCodexRequestBody(" ajustar fluxo "), "CODEX APROVADO: ajustar fluxo");

    let inserted = false;
    const messages = [];
    const messagesService = await loadMessages(() => ({
      from: () => ({
        insert(payload) {
          return {
            select() { return this; },
            async single() {
              if (inserted) return { data: null, error: { code: "23505" } };
              inserted = true;
              const row = { id: "request-1", created_at: "2026-01-01", ...payload };
              messages.push(row);
              return { data: row, error: null };
            },
          };
        },
      }),
    }));
    const input = { conversationId: "conversation-1", customerId: "customer-1", direction: "inbound", messageType: "system", body: buildApprovedCodexRequestBody("ajustar fluxo"), providerMessageId: "provider-1" };
    assert.equal((await messagesService.saveWhatsAppMessage(input)).ok, true);
    assert.equal((await messagesService.saveWhatsAppMessage(input)).duplicate, true);
    assert.equal(messages.length, 1);
  } finally {
    if (previous === undefined) delete process.env.CODEX_WHATSAPP_PHONES;
    else process.env.CODEX_WHATSAPP_PHONES = previous;
  }
});

test("automation.issue builds the GitHub request and webhook replay creates no second issue", async () => {
  const previousToken = process.env.GITHUB_ISSUES_TOKEN;
  const previousRepo = process.env.GITHUB_ISSUES_REPOSITORY;
  const previousFetch = globalThis.fetch;
  let issueCalls = 0;
  process.env.GITHUB_ISSUES_TOKEN = "test-token";
  process.env.GITHUB_ISSUES_REPOSITORY = "FelipeFraul/rota5";
  globalThis.fetch = async (url, init) => {
    issueCalls += 1;
    assert.equal(url, "https://api.github.com/repos/FelipeFraul/rota5/issues");
    assert.equal(init.method, "POST");
    return Response.json({ number: 42, html_url: "https://github.test/issues/42" });
  };
  try {
    assert.deepEqual(await createGitHubIssue({ title: "CODEX #1", body: "Pedido" }), {
      ok: true, issueNumber: 42, issueUrl: "https://github.test/issues/42",
    });

    process.env.ZAPI_WEBHOOK_SECRET = "webhook-secret";
    const webhook = await loadProductionModule("src/app/api/webhook/zapi/route.ts", {
      randomUUID, timingSafeEqual,
      jsonError: (message, status) => json({ ok: false, message }, status),
      jsonOk: (body) => json({ ok: true, ...body }), methodNotAllowed: () => json({}, 405), unauthorized: () => json({}, 401),
      createGitHubIssue: async () => { issueCalls += 1; return { ok: true }; },
      logError: () => {}, logInfo: () => {}, logWarn: () => {},
      findInboundMessageByProviderId: async () => ({ ok: true, message: { id: "existing" } }),
      normalizeWhatsAppPhone: (value) => String(value ?? "").replace(/\D/g, ""),
    });
    const replay = await webhook.POST(new Request("http://local/api/webhook/zapi", {
      method: "POST", headers: { "x-zapi-webhook-secret": "webhook-secret", "content-type": "application/json" },
      body: JSON.stringify({ phone: "5515999999999", text: "CODEX: replay", messageId: "provider-1" }),
    }));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).duplicate, true);
    assert.equal(issueCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.GITHUB_ISSUES_TOKEN; else process.env.GITHUB_ISSUES_TOKEN = previousToken;
    if (previousRepo === undefined) delete process.env.GITHUB_ISSUES_REPOSITORY; else process.env.GITHUB_ISSUES_REPOSITORY = previousRepo;
    delete process.env.ZAPI_WEBHOOK_SECRET;
  }
});

test("automation.list returns only authorized unprocessed requests", async () => {
  const previous = process.env.CODEX_WHATSAPP_PHONES;
  process.env.CODEX_WHATSAPP_PHONES = "5515999999999";
  try {
    const db = new MemorySupabase({ whatsapp_messages: [
      { id: "pending-1", body: "CODEX APROVADO: um", direction: "inbound", message_type: "system", created_at: "2026-01-01", customers: { whatsapp_phone: "5515999999999" } },
      { id: "done-1", body: "CODEX APROVADO: dois", direction: "inbound", message_type: "system", created_at: "2026-01-02", customers: { whatsapp_phone: "5515999999999" } },
      { id: "foreign", body: "CODEX APROVADO: tres", direction: "inbound", message_type: "system", created_at: "2026-01-03", customers: { whatsapp_phone: "5515888888888" } },
    ] });
    const runner = await loadRunner({ runCodex: async () => ({ status: 0, logs: "" }), sendZapiText: async () => ({ ok: true }) });
    const rows = await runner.listPendingRequests(db, { processedRequests: { "done-1": { status: "completed" } } });
    assert.deepEqual(rows.map((row) => row.id), ["pending-1"]);
  } finally {
    if (previous === undefined) delete process.env.CODEX_WHATSAPP_PHONES; else process.env.CODEX_WHATSAPP_PHONES = previous;
  }
});

test("automation.execute runs the selected valid request and rejects an empty request", async () => {
  let spawned;
  let stdin = "";
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(),
    stdin: {
      write(value) { stdin += value; },
      end() { queueMicrotask(() => child.emit("close", 0)); },
    },
  });
  const directRunner = await loadProductionModule(
    "scripts/codex-local-runner.mjs",
    {
      spawn: (command, args, options) => { spawned = { command, args, options }; return child; },
      spawnSync: () => ({ status: 0, stdout: "", stderr: "" }), existsSync: () => false,
      mkdirSync: () => {}, readdirSync: () => [], readFileSync: () => "", writeFileSync: () => {}, join, resolve,
      createClient: () => { throw new Error("real Supabase forbidden"); },
    },
    ["runCodex"],
    (source) => source.replace(/\nmain\(\)\.catch[\s\S]*$/m, "\n"),
  );
  assert.equal((await directRunner.runCodex({ id: "request-valid" }, "corrigir teste")).status, 0);
  assert.deepEqual(spawned.args.slice(0, 6), ["exec", "--cd", process.cwd(), "--sandbox", "workspace-write", "-"]);
  assert.equal(spawned.options.stdio.join(","), "pipe,pipe,pipe");
  assert.match(stdin, /Pedido CODEX: #request-/);
  assert.match(stdin, /corrigir teste/);

  let executions = 0;
  const writes = [];
  const runner = await loadRunner({
    runCodex: async (_request, prompt) => { executions += 1; assert.equal(prompt, "corrigir teste"); return { status: 0, logs: "ok" }; },
    sendZapiText: async () => ({ ok: true }),
  }, writes);
  const state = { processedRequests: {} };
  await runner.processRequest({ id: "request-valid", body: "CODEX APROVADO: corrigir teste", customers: {} }, state);
  await runner.processRequest({ id: "request-empty", body: "CODEX APROVADO:   ", customers: {} }, state);
  assert.equal(executions, 1);
  assert.equal(state.processedRequests["request-valid"].status, "completed");
  assert.equal(state.processedRequests["request-empty"].status, "failed");
  assert.ok(writes.length >= 2);
});

test("automation.notify records successful execution even when notification fails and does not re-list it", async () => {
  let notifications = 0;
  const runner = await loadRunner({
    runCodex: async () => ({ status: 0, logs: "executed" }),
    sendZapiText: async () => { notifications += 1; return { ok: false, error: "offline" }; },
  });
  const request = { id: "notify-1", body: "CODEX APROVADO: tarefa", customers: { whatsapp_phone: "5515999999999" } };
  const state = { processedRequests: {} };
  await runner.processRequest(request, state);
  assert.equal(notifications, 1);
  assert.equal(state.processedRequests[request.id].status, "completed");

  process.env.CODEX_WHATSAPP_PHONES = "5515999999999";
  const db = new MemorySupabase({ whatsapp_messages: [{ ...request, direction: "inbound", message_type: "system", created_at: "2026-01-01" }] });
  assert.deepEqual(await runner.listPendingRequests(db, state), []);
  assert.equal(notifications, 1);
});
