import assert from "node:assert/strict";
import {
  resolveConversationContextForInbound,
} from "../src/lib/tickets/conversationState.ts";

const now = new Date("2026-06-21T12:00:00.000Z");
const context = {
  step: "showing_events",
  state: "showing_events",
  updatedAt: "2026-06-21T10:00:00.000Z",
};

const inactive = resolveConversationContextForInbound({
  context,
  lastMessageAt: "2026-06-21T10:59:59.000Z",
  now,
  inactivityTtlMinutes: 60,
});
assert.equal(inactive.resetReason, "inactivity");
assert.equal(inactive.context.state, "idle");

const active = resolveConversationContextForInbound({
  context,
  lastMessageAt: "2026-06-21T11:00:01.000Z",
  now,
  inactivityTtlMinutes: 60,
});
assert.equal(active.resetReason, null);
assert.equal(active.context, context);

const expiredAdminAuth = resolveConversationContextForInbound({
  context: {
    step: "admin_auth_pending",
    state: "admin_auth_pending",
    updatedAt: "2026-06-21T11:59:00.000Z",
    admin: { authChallengeExpiresAt: "2026-06-21T11:59:59.000Z" },
  },
  lastMessageAt: "2026-06-21T11:59:00.000Z",
  now,
});
assert.equal(expiredAdminAuth.resetReason, "admin_auth_expired");
assert.equal(expiredAdminAuth.context.state, "idle");

const validAdminAuth = resolveConversationContextForInbound({
  context: {
    step: "admin_auth_pending",
    state: "admin_auth_pending",
    updatedAt: "2026-06-21T11:59:00.000Z",
    admin: { authChallengeExpiresAt: "2026-06-21T12:01:00.000Z" },
  },
  lastMessageAt: "2026-06-21T11:59:00.000Z",
  now,
});
assert.equal(validAdminAuth.resetReason, null);

const newConversation = resolveConversationContextForInbound({
  context: {},
  lastMessageAt: null,
  now,
});
assert.equal(newConversation.resetReason, null);

console.log("conversation inactivity tests passed");
