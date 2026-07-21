import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
import { routeTicketMessage } from "../src/lib/tickets/router.ts";

const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
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
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse[\s\S]*const adminUserResult = await getAdminUserByPhone\(customer\.whatsapp_phone\);/,
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
    /const authRestartResponse = await buildAdminAuthPendingRestartResponse[\s\S]*const adminUserResult = await getAdminUserByPhone\(customer\.whatsapp_phone\);/,
  );
  assert.match(
    adminAuthPendingBlock,
    /if \(\s*!adminUserResult\.ok \|\|\s*!adminUserResult\.adminUser \|\|\s*adminUserResult\.adminUser\.status !== "active"\s*\) \{\s*return \{\s*reply: TICKET_MESSAGES\.adminReservedNeutral,\s*nextContext: \{\s*\.\.\.baseContext,\s*step: "idle",\s*state: "idle",\s*admin: undefined,\s*\},\s*\};\s*\}/,
  );
  assert.match(
    adminAuthPendingBlock,
    /adminUserResult\.adminUser\.status !== "active"[\s\S]*const blockStatus = await getAdminAuthBlockStatus\(customer\.whatsapp_phone\);/,
  );
  assert.match(
    adminAuthPendingBlock,
    /adminUserResult\.adminUser\.status !== "active"[\s\S]*const codeResult = await consumeAdminLoginChallengeCode\(\{/,
  );
});
