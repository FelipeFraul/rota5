import {
  buildInitialConversationState,
  type TicketConversationState,
} from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import {
  ADMIN_LOGIN_LINK_REDACTED_BODY,
  consumeAdminLoginChallengeCode,
  createAdminLoginChallenge,
  getAdminAuthBlockStatus,
  getAdminUserByPhone,
  isAdminLogoutCommand,
  isReservedAdminCommand,
  type AdminRole,
  type AdminUser,
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

function maskAdminPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 4) {
    return "nÃƒÆ’Ã‚Â£o informado";
  }

  return `****${digits.slice(-4)}`;
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

export async function buildAdminAuthPendingRestartResponse({
  text,
  phoneNumber,
  baseContext,
  sourceIdentifier,
}: {
  text: string;
  phoneNumber: string;
  baseContext: TicketConversationState;
  sourceIdentifier?: string | null;
}) {
  if (!isReservedAdminCommand(text)) {
    return null;
  }

  return startAdminLogin({
    phoneNumber,
    baseContext,
    sourceIdentifier,
  });
}

export async function buildAdminAuthPendingActiveAdminResponse({
  phoneNumber,
  baseContext,
}: {
  phoneNumber: string;
  baseContext: TicketConversationState;
}): Promise<
  | {
      response: {
        reply: string;
        nextContext: TicketConversationState;
      };
      adminUser?: never;
    }
  | {
      response: null;
      adminUser: AdminUser;
    }
> {
  const adminUserResult = await getAdminUserByPhone(phoneNumber);

  if (
    !adminUserResult.ok ||
    !adminUserResult.adminUser ||
    adminUserResult.adminUser.status !== "active"
  ) {
    return {
      response: {
        reply: TICKET_MESSAGES.adminReservedNeutral,
        nextContext: {
          ...baseContext,
          step: "idle" as const,
          state: "idle" as const,
          admin: undefined,
        },
      },
    };
  }

  return {
    response: null,
    adminUser: adminUserResult.adminUser,
  };
}

export async function buildAdminAuthPendingBlockResponse({
  phoneNumber,
  baseContext,
  adminUser,
}: {
  phoneNumber: string;
  baseContext: TicketConversationState;
  adminUser: AdminUser;
}) {
  const blockStatus = await getAdminAuthBlockStatus(phoneNumber);

  if (!blockStatus.ok || !blockStatus.blocked) {
    return null;
  }

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
        adminUserId: adminUser.id,
        role: adminUser.role,
      }),
    },
  };
}

export function consumePendingAdminChallenge({
  phoneNumber,
  text,
  challengeId,
  sourceIdentifier,
}: {
  phoneNumber: string;
  text: string;
  challengeId?: string;
  sourceIdentifier?: string | null;
}) {
  return consumeAdminLoginChallengeCode({
    phone: phoneNumber,
    code: text,
    challengeId,
    sourceIdentifier,
  });
}

export function buildAdminAuthFailureAlertMessage({
  failureResult,
  phoneNumber,
}: {
  failureResult:
    | {
        ok: true;
        alertPhone?: string | null;
        failedAttempts: number;
        hardLocked?: boolean;
        retryAfterMinutes?: number | null;
      }
    | {
        ok: false;
        alertPhone?: string | null;
        failedAttempts?: number;
        hardLocked?: boolean;
        retryAfterMinutes?: number | null;
      }
    | null
    | undefined;
  phoneNumber: string;
}) {
  if (!failureResult?.ok || !failureResult.alertPhone) {
    return null;
  }

  return {
    type: "text" as const,
    phone: failureResult.alertPhone,
    body: [
      "*ALERTA DE ACESSO ADMIN*",
      "",
      `O telefone ${maskAdminPhone(phoneNumber)} teve ${failureResult.failedAttempts} tentativas incorretas de login administrativo.`,
      failureResult.hardLocked
        ? "O acesso foi bloqueado atÃƒÂ© liberaÃƒÂ§ÃƒÂ£o manual por Diretor."
        : `O acesso foi bloqueado temporariamente por ${failureResult.retryAfterMinutes ?? 15} minutos.`,
      "",
      "Entre em Administradores > Liberar administrador bloqueado se reconhecer o acesso.",
    ].join("\n"),
  };
}

export function buildAdminAuthFailureReply({
  failureResult,
}: {
  failureResult:
    | {
        hardLocked?: boolean;
        temporaryLocked?: boolean;
        retryAfterMinutes?: number | null;
      }
    | null
    | undefined;
}) {
  return failureResult?.hardLocked
    ? TICKET_MESSAGES.adminAuthHardLocked
    : failureResult?.temporaryLocked
      ? TICKET_MESSAGES.adminAuthTemporaryLocked.replace(
          "{minutes}",
          String(failureResult.retryAfterMinutes ?? 15),
        )
      : TICKET_MESSAGES.adminAuthInvalid;
}
