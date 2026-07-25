import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
import { TICKET_MESSAGES } from "../src/lib/tickets/messages.ts";
import { routeTicketMessage } from "../src/lib/tickets/router.ts";

const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);
const adminLoginFlow = readFileSync(
  new URL("../src/lib/tickets/services/adminLoginFlow.ts", import.meta.url),
  "utf8",
);

function sliceBetween(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `start pattern not found: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `end pattern not found: ${endPattern}`);
  return rest.slice(0, end);
}

function withoutUpdatedAt(context) {
  const clone = { ...context };
  delete clone.updatedAt;
  return clone;
}

test("admin_auth_pending cancela login com logout sem executar outros ramos", async () => {
  const result = await routeTicketMessage({
    customer: {
      id: "customer-admin-cancel",
      whatsapp_phone: "5511999999999",
    },
    conversation: {
      id: "conversation-admin-cancel",
      context: {
        ...buildInitialConversationState(),
        step: "admin_auth_pending",
        state: "admin_auth_pending",
        admin: {
          authChallengeId: "challenge-id",
          authChallengeExpiresAt: "2026-07-20T23:59:59.000Z",
          role: "admin",
          adminUserId: "admin-user-id",
        },
      },
    },
    text: "sair",
  });

  assert.equal(result.reply, TICKET_MESSAGES.genericHelpPrompt);
  assert.equal(result.outboundMessages, undefined);
  assert.equal(result.intentResolution, undefined);
  assert.equal(typeof result.nextContext.updatedAt, "string");
  assert.ok(result.nextContext.updatedAt.length > 0);

  assert.deepEqual(
    withoutUpdatedAt(result.nextContext),
    {
      ...withoutUpdatedAt(buildInitialConversationState()),
      publicInitialHelpSent: true,
    },
  );
});

test("admin_auth_pending reinicia login em comando admin reservado antes de validar codigo", () => {
  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n    const publicHelpResult = handlePublicHelpMessage/,
  );

  assert.match(
    adminAuthPendingBlock,
    /const authCancelResponse = buildAdminAuthPendingCancelResponse\(\{ text \}\);[\s\S]*if \(authCancelResponse\) \{\s*return authCancelResponse;\s*\}/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse\(\{\s*text,\s*phoneNumber: customer\.whatsapp_phone,\s*baseContext,\s*sourceIdentifier,\s*\}\);[\s\S]*if \(authRestartResponse\) \{\s*return authRestartResponse;\s*\}/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse[\s\S]*const activeAdminResponse = await buildAdminAuthPendingActiveAdminResponse/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse[\s\S]*const codeResult = await consumePendingAdminChallenge\(\{/,
  );
});

test("admin_auth_pending e comando admin têm prioridade sobre bootstrap público", async () => {
  const startAdminLoginIndex = router.indexOf("return startAdminLogin({");
  const bootstrapIndex = router.indexOf("return buildPublicInitialHelpResponse(baseContext);");
  const adminAuthPendingIndex = router.indexOf('if (previousState.state === "admin_auth_pending") {');
  const publicEntryIndex = router.indexOf("const publicEntryGateResponse = buildPublicEntryGateResponse({");

  assert.ok(startAdminLoginIndex > 0, "entrada de login admin nao encontrada");
  assert.ok(bootstrapIndex > 0, "bootstrap publico nao encontrado");
  assert.ok(adminAuthPendingIndex > 0, "estado admin_auth_pending nao encontrado");
  assert.ok(publicEntryIndex > 0, "public entry gate nao encontrado");
  assert.ok(
    startAdminLoginIndex < bootstrapIndex,
    "primeira mensagem admin deve iniciar login antes do bootstrap publico",
  );
  assert.ok(
    adminAuthPendingIndex < publicEntryIndex,
    "mensagens durante admin_auth_pending devem ser tratadas antes do public entry gate",
  );

  const initialAdminBlock = sliceBetween(
    router,
    /if \(\s*reservedAdminCommand &&\s*previousState\.state !== "admin_auth_pending"/,
    /\n  if \(\s*shouldSendPublicInitialHelp\(baseContext\)/,
  );
  assert.match(initialAdminBlock, /return startAdminLogin\(\{/);
  assert.doesNotMatch(initialAdminBlock, /buildPublicInitialHelpResponse/);

  const initialBootstrapBlock = sliceBetween(
    router,
    /if \(\s*shouldSendPublicInitialHelp\(baseContext\)/,
    /\n  if \(previousState\.state === "admin_auth_pending"\)/,
  );
  assert.match(initialBootstrapBlock, /!reservedAdminCommand/);
  assert.match(initialBootstrapBlock, /previousState\.state !== "admin_auth_pending"/);
  assert.match(initialBootstrapBlock, /previousState\.state !== "admin_menu"/);
  assert.match(initialBootstrapBlock, /!isAdminSubmenuState\(previousState\.state\)/);
  assert.match(initialBootstrapBlock, /!previousState\.admin\?\.sessionId/);

  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n  const publicEntryGateResponse = buildPublicEntryGateResponse/,
  );
  assert.match(adminAuthPendingBlock, /const authRestartResponse = await buildAdminAuthPendingRestartResponse/);
  assert.match(adminAuthPendingBlock, /const codeResult = await consumePendingAdminChallenge\(\{/);
  assert.match(adminAuthPendingBlock, /const authFailureReply = buildAdminAuthFailureReply\(\{ failureResult \}\);/);
  assert.match(adminAuthPendingBlock, /reply: authFailureReply,/);
  assert.match(adminAuthPendingBlock, /state: "admin_auth_pending"/);
  assert.match(adminAuthPendingBlock, /const sessionResult = await createAdminSession\(codeResult\.adminUser\);/);
  assert.match(adminAuthPendingBlock, /reply: formatAdminMenu\(codeResult\.adminUser\.role\),/);
  assert.doesNotMatch(adminAuthPendingBlock, /buildPublicInitialHelpResponse/);
  assert.doesNotMatch(adminAuthPendingBlock, /TICKET_MESSAGES\.genericHelp/);

  const publicResult = await routeTicketMessage({
    customer: {
      id: "customer-public-no-active-state",
      whatsapp_phone: "5511888888888",
    },
    conversation: {
      id: "conversation-public-no-active-state",
      context: buildInitialConversationState(),
    },
    text: "oi",
  });

  assert.equal(publicResult.reply, TICKET_MESSAGES.genericHelp);
  assert.equal(publicResult.outboundMessages?.[0]?.body, TICKET_MESSAGES.genericHelp);
  assert.equal(publicResult.outboundMessages?.[1]?.body, TICKET_MESSAGES.genericHelpCommands);
});

test("admin_auth_pending valida administrador ativo antes de bloqueio e codigo", () => {
  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n    const publicHelpResult = handlePublicHelpMessage/,
  );

  assert.match(
    adminAuthPendingBlock,
    /const activeAdminResponse = await buildAdminAuthPendingActiveAdminResponse\(\{\s*phoneNumber: customer\.whatsapp_phone,\s*baseContext,\s*\}\);/,
  );
  assert.match(
    adminAuthPendingBlock,
    /if \(activeAdminResponse\.response\) \{\s*return activeAdminResponse\.response;\s*\}\s*const adminUser = activeAdminResponse\.adminUser;/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const adminUser = activeAdminResponse\.adminUser;[\s\S]*const blockResponse = await buildAdminAuthPendingBlockResponse/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const adminUser = activeAdminResponse\.adminUser;[\s\S]*const codeResult = await consumePendingAdminChallenge\(\{/,
  );
  assert.match(
    adminLoginFlow,
    /const adminUserResult = await getAdminUserByPhone\(phoneNumber\);/,
  );
  assert.match(
    adminLoginFlow,
    /if \(\s*!adminUserResult\.ok \|\|\s*!adminUserResult\.adminUser \|\|\s*adminUserResult\.adminUser\.status !== "active"\s*\) \{\s*return \{\s*response: \{\s*reply: TICKET_MESSAGES\.adminReservedNeutral,\s*nextContext: \{\s*\.\.\.baseContext,\s*step: "idle" as const,\s*state: "idle" as const,\s*admin: undefined,\s*\},\s*\},\s*\};\s*\}/,
  );
  assert.match(
    adminLoginFlow,
    /return \{\s*response: null,\s*adminUser: adminUserResult\.adminUser,\s*\};/,
  );
});

test("admin_auth_pending bloqueio administrativo ativo retorna antes de validar codigo", () => {
  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n    const publicHelpResult = handlePublicHelpMessage/,
  );

  assert.match(
    adminAuthPendingBlock,
    /const blockResponse = await buildAdminAuthPendingBlockResponse\(\{\s*phoneNumber: customer\.whatsapp_phone,\s*baseContext,\s*adminUser,\s*\}\);/,
  );
  assert.match(
    adminAuthPendingBlock,
    /if \(blockResponse\) \{\s*return blockResponse;\s*\}/,
  );
  assert.match(
    adminLoginFlow,
    /const blockStatus = await getAdminAuthBlockStatus\(phoneNumber\);/,
  );
  assert.match(
    adminLoginFlow,
    /if \(!blockStatus\.ok \|\| !blockStatus\.blocked\) \{\s*return null;\s*\}/,
  );
  assert.match(
    adminLoginFlow,
    /reply:\s*blockStatus\.type === "temporary"\s*\? TICKET_MESSAGES\.adminAuthTemporaryLocked\.replace\(\s*"\{minutes\}",\s*String\(blockStatus\.retryAfterMinutes\),\s*\)\s*: TICKET_MESSAGES\.adminAuthHardLocked,/,
  );
  assert.match(
    adminLoginFlow,
    /nextContext: \{\s*\.\.\.baseContext,\s*step: "admin_auth_pending" as const,\s*state: "admin_auth_pending" as const,\s*admin: buildAdminContext\(\{\s*adminUserId: adminUser\.id,\s*role: adminUser\.role,\s*\}\),\s*\},\s*\};\s*\}/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const blockResponse = await buildAdminAuthPendingBlockResponse[\s\S]*if \(blockResponse\) \{[\s\S]*return blockResponse;[\s\S]*\}[\s\S]*const codeResult = await consumePendingAdminChallenge\(\{/,
  );
});

test("admin_auth_pending consome challenge apos cancelamento reinicio admin ativo e bloqueio", () => {
  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n    const publicHelpResult = handlePublicHelpMessage/,
  );

  assert.match(
    adminAuthPendingBlock,
    /const authCancelResponse = buildAdminAuthPendingCancelResponse\(\{ text \}\);[\s\S]*const authRestartResponse = await buildAdminAuthPendingRestartResponse/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse[\s\S]*const activeAdminResponse = await buildAdminAuthPendingActiveAdminResponse/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const activeAdminResponse = await buildAdminAuthPendingActiveAdminResponse[\s\S]*const blockResponse = await buildAdminAuthPendingBlockResponse/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const blockResponse = await buildAdminAuthPendingBlockResponse[\s\S]*if \(blockResponse\) \{\s*return blockResponse;\s*\}[\s\S]*const codeResult = await consumePendingAdminChallenge\(\{\s*phoneNumber: customer\.whatsapp_phone,\s*text,\s*challengeId: previousState\.admin\?\.authChallengeId,\s*sourceIdentifier,\s*\}\);/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const codeResult = await consumePendingAdminChallenge\(\{[\s\S]*\}\);[\s\S]*if \(!codeResult\.ok\) \{/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const codeResult = await consumePendingAdminChallenge\(\{[\s\S]*\}\);[\s\S]*const sessionResult = await createAdminSession\(codeResult\.adminUser\);/,
  );
  assert.match(
    adminAuthPendingBlock,
    /const codeResult = await consumePendingAdminChallenge\(\{[\s\S]*\}\);[\s\S]*reply: formatAdminMenu\(codeResult\.adminUser\.role\),/,
  );
  assert.match(
    adminLoginFlow,
    /return consumeAdminLoginChallengeCode\(\{\s*phone: phoneNumber,\s*code: text,\s*challengeId,\s*sourceIdentifier,\s*\}\);/,
  );
});

test("admin_auth_pending falha de challenge monta alerta sem criar sessao ou contexto", () => {
  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n    const publicHelpResult = handlePublicHelpMessage/,
  );

  const challengeFailureBlock = sliceBetween(
    adminAuthPendingBlock,
    /if \(!codeResult\.ok\) \{/,
    /\n    const sessionResult = await createAdminSession/,
  );
  const alertMessageBlock = sliceBetween(
    adminLoginFlow,
    /export function buildAdminAuthFailureAlertMessage/,
    /\n  };\n}/,
  );

  assert.match(
    challengeFailureBlock,
    /const failureResult =\s*"failureResult" in codeResult \? codeResult\.failureResult : null;/,
  );
  assert.match(
    challengeFailureBlock,
    /const alertMessage = buildAdminAuthFailureAlertMessage\(\{\s*failureResult,\s*phoneNumber: customer\.whatsapp_phone,\s*\}\);/,
  );
  assert.match(
    alertMessageBlock,
    /if \(!failureResult\?\.ok \|\| !failureResult\.alertPhone\) \{\s*return null;\s*\}/,
  );
  assert.match(
    alertMessageBlock,
    /type: "text" as const,\s*phone: failureResult\.alertPhone,/,
  );
  assert.match(
    alertMessageBlock,
    /body: \[\s*"\*ALERTA DE ACESSO ADMIN\*",\s*"",\s*`O telefone \$\{maskAdminPhone\(phoneNumber\)\} teve \$\{failureResult\.failedAttempts\} tentativas incorretas de login administrativo\.`,\s*failureResult\.hardLocked\s*\?\s*"O acesso foi bloqueado atÃƒÂ© liberaÃƒÂ§ÃƒÂ£o manual por Diretor\."\s*:\s*`O acesso foi bloqueado temporariamente por \$\{failureResult\.retryAfterMinutes \?\? 15\} minutos\.`,\s*"",\s*"Entre em Administradores > Liberar administrador bloqueado se reconhecer o acesso\.",\s*\]\.join\("\\n"\),/,
  );
  assert.match(
    challengeFailureBlock,
    /outboundMessages: alertMessage\s*\? \[\{ type: "text", body: authFailureReply \}, alertMessage\]\s*: undefined,/,
  );
  assert.doesNotMatch(alertMessageBlock, /createAdminSession/);
  assert.doesNotMatch(
    alertMessageBlock,
    /nextContext: \{\s*\.\.\.baseContext,/,
  );
});

test("admin_auth_pending falha de challenge escolhe resposta antes de outbound", () => {
  const adminAuthPendingBlock = sliceBetween(
    router,
    /if \(previousState\.state === "admin_auth_pending"\) \{/,
    /\n    const publicHelpResult = handlePublicHelpMessage/,
  );

  const challengeFailureBlock = sliceBetween(
    adminAuthPendingBlock,
    /if \(!codeResult\.ok\) \{/,
    /\n    const sessionResult = await createAdminSession/,
  );

  assert.match(
    challengeFailureBlock,
    /const authFailureReply = buildAdminAuthFailureReply\(\{ failureResult \}\);/,
  );
  assert.match(
    adminLoginFlow,
    /return failureResult\?\.hardLocked\s*\? TICKET_MESSAGES\.adminAuthHardLocked\s*: failureResult\?\.temporaryLocked\s*\? TICKET_MESSAGES\.adminAuthTemporaryLocked\.replace\(\s*"\{minutes\}",\s*String\(failureResult\.retryAfterMinutes \?\? 15\),\s*\)\s*: TICKET_MESSAGES\.adminAuthInvalid;/,
  );
  assert.match(
    challengeFailureBlock,
    /reply: authFailureReply,\s*outboundMessages: alertMessage\s*\? \[\{ type: "text", body: authFailureReply \}, alertMessage\]\s*: undefined,/,
  );
});
