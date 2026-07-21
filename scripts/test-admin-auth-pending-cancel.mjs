import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
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

  assert.equal(
    result.reply,
    "Login administrativo cancelado. Para acessar novamente, envie admin.",
  );
  assert.equal(result.outboundMessages, undefined);
  assert.equal(result.intentResolution, undefined);
  assert.equal(typeof result.nextContext.updatedAt, "string");
  assert.ok(result.nextContext.updatedAt.length > 0);

  assert.deepEqual(
    withoutUpdatedAt(result.nextContext),
    withoutUpdatedAt(buildInitialConversationState()),
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
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse[\s\S]*const codeResult = await consumeAdminLoginChallengeCode\(\{/,
  );
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
    /const adminUser = activeAdminResponse\.adminUser;[\s\S]*const codeResult = await consumeAdminLoginChallengeCode\(\{/,
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
    /const blockResponse = await buildAdminAuthPendingBlockResponse[\s\S]*if \(blockResponse\) \{[\s\S]*return blockResponse;[\s\S]*\}[\s\S]*const codeResult = await consumeAdminLoginChallengeCode\(\{/,
  );
});
