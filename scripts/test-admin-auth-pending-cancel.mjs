import assert from "node:assert/strict";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
import { routeTicketMessage } from "../src/lib/tickets/router.ts";

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
