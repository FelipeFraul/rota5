import {
  buildInitialConversationState,
  type TicketConversationState,
} from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import {
  ADMIN_LOGIN_LINK_REDACTED_BODY,
  createAdminLoginChallenge,
  getAdminAuthBlockStatus,
  getAdminUserByPhone,
  isAdminLogoutCommand,
  type AdminRole,
} from "@/lib/tickets/services/adminAuth";

function buildAdminContext({
  adminUserId,
  role,
  sessionId,
  expiresAt,
  authChallengeId,
  authChallengeExpiresAt,
  authChallengePurpose,
}: {
  adminUserId?: string;
  role?: AdminRole;
  sessionId?: string;
  expiresAt?: string;
  authChallengeId?: string;
  authChallengeExpiresAt?: string;
  authChallengePurpose?: "admin_menu" | "event_editor";
}) {
  return {
    ...(adminUserId ? { adminUserId } : {}),
    ...(role ? { role } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(authChallengeId ? { authChallengeId } : {}),
    ...(authChallengeExpiresAt ? { authChallengeExpiresAt } : {}),
    ...(authChallengePurpose ? { authChallengePurpose } : {}),
  };
}

export async function startAdminLogin({
  phoneNumber,
  baseContext,
  sourceIdentifier,
}: {
  phoneNumber: string;
  baseContext: TicketConversationState;
  sourceIdentifier?: string | null;
}) {
  const adminUserResult = await getAdminUserByPhone(phoneNumber);

  if (
    !adminUserResult.ok ||
    !adminUserResult.adminUser ||
    adminUserResult.adminUser.status !== "active"
  ) {
    return {
      reply: TICKET_MESSAGES.adminReservedNeutral,
      nextContext: {
        ...baseContext,
        step: "idle" as const,
        state: "idle" as const,
        admin: undefined,
      },
    };
  }

  const blockStatus = await getAdminAuthBlockStatus(phoneNumber);

  if (blockStatus.ok && blockStatus.blocked) {
    return {
      reply:
        blockStatus.type === "temporary"
          ? TICKET_MESSAGES.adminAuthTemporaryLocked.replace(
              "{minutes}",
              String(blockStatus.retryAfterMinutes),
            )
          : TICKET_MESSAGES.adminAuthHardLocked,
      nextContext: {
        ...baseContext,
        step: "admin_auth_pending" as const,
        state: "admin_auth_pending" as const,
        admin: buildAdminContext({
          adminUserId: adminUserResult.adminUser.id,
          role: adminUserResult.adminUser.role,
        }),
      },
    };
  }

  const challengeResult = await createAdminLoginChallenge({
    adminUser: adminUserResult.adminUser,
    sourceIdentifier,
  });

  if (!challengeResult.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: {
        ...baseContext,
        step: "idle" as const,
        state: "idle" as const,
        admin: undefined,
      },
    };
  }

  const authReply = [
    "*LOGIN ADMINISTRATIVO*",
    "",
    "Abra este link para informar sua senha individual:",
    challengeResult.loginUrl,
    "",
    `O link expira em ${challengeResult.expiresInMinutes} minutos.`,
    "Depois de confirmar a senha, envie aqui o cÃƒÂ³digo de uso ÃƒÂºnico exibido na pÃƒÂ¡gina.",
  ].join("\n");

  return {
    reply: authReply,
    outboundMessages: [
      {
        type: "text" as const,
        body: authReply,
        persistedBody: ADMIN_LOGIN_LINK_REDACTED_BODY,
      },
    ],
    nextContext: {
      ...baseContext,
      step: "admin_auth_pending" as const,
      state: "admin_auth_pending" as const,
      admin: buildAdminContext({
        adminUserId: adminUserResult.adminUser.id,
        role: adminUserResult.adminUser.role,
        authChallengeId: challengeResult.challengeId,
        authChallengeExpiresAt: challengeResult.expiresAt,
        authChallengePurpose: "admin_menu",
      }),
    },
  };
}

export function buildAdminAuthPendingCancelResponse({ text }: { text: string }) {
  if (!isAdminLogoutCommand(text)) {
    return null;
  }

  return {
    reply: "Login administrativo cancelado. Para acessar novamente, envie admin.",
    nextContext: {
      ...buildInitialConversationState(),
      updatedAt: new Date().toISOString(),
    },
  };
}
