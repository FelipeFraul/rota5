import type { TicketConversationState } from "@/lib/tickets/conversationState";
import type { RouteTicketMessageOutput } from "@/lib/tickets/router";

const MAX_ADMIN_NAVIGATION_DEPTH = 40;

type AdminNavigationFrame = {
  context: Record<string, unknown>;
  reply: string;
  stackable?: boolean;
};

type AdminNavigationState = {
  frames: AdminNavigationFrame[];
  current: AdminNavigationFrame;
};

function normalizeCommand(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function isBackCommand(value: string) {
  const normalized = normalizeCommand(value);
  return (
    normalized === "voltar" ||
    normalized === "volta" ||
    normalized === "voltei" ||
    normalized === "vortei" ||
    normalized === "back"
  );
}

function isResetCommand(value: string) {
  const normalized = normalizeCommand(value);
  return (
    normalized === "menu" ||
    normalized === "inicio" ||
    normalized === "cancelar" ||
    normalized === "cancela"
  );
}

function isAdminState(value: unknown) {
  return typeof value === "string" && value.startsWith("admin_");
}

function isSensitiveAdminState(value: unknown) {
  return (
    value === "admin_auth_pending" ||
    value === "admin_gate_password_collecting" ||
    value === "admin_fixed_gate_passphrase_collecting" ||
    value === "admin_user_create_collect_passphrase" ||
    value === "admin_user_passphrase_collect" ||
    value === "admin_user_passphrase_confirm"
  );
}

function stripNavigationMetadata(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const stableContext = { ...context };
  delete stableContext.adminNavigation;
  delete stableContext.deliveryGuard;
  delete stableContext.numericPrompt;
  delete stableContext.retiredNumericMessageIds;
  delete stableContext.lastInboundText;
  delete stableContext.updatedAt;
  return stableContext;
}

function readNavigation(
  context: Record<string, unknown>,
): AdminNavigationState | null {
  const candidate = context.adminNavigation;
  if (!candidate || typeof candidate !== "object") return null;

  const navigation = candidate as Partial<AdminNavigationState>;
  if (!Array.isArray(navigation.frames) || !navigation.current) return null;
  if (
    typeof navigation.current !== "object" ||
    typeof navigation.current.reply !== "string" ||
    !navigation.current.context
  ) {
    return null;
  }

  return {
    frames: navigation.frames.filter(
      (frame): frame is AdminNavigationFrame =>
        Boolean(
          frame &&
            typeof frame === "object" &&
            typeof frame.reply === "string" &&
            frame.context &&
            typeof frame.context === "object",
        ),
    ),
    current: navigation.current,
  };
}

function sameScreen(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withNavigation(
  context: TicketConversationState,
  navigation: AdminNavigationState,
) {
  return {
    ...context,
    adminNavigation: navigation,
  } as TicketConversationState;
}

/**
 * Makes admin navigation a strict LIFO stack. The router still runs first so
 * session expiry and permissions are always checked. A back command then
 * restores the exact preceding screen/context and drops the abandoned branch.
 */
export function reconcileAdminNavigation({
  currentContext,
  inboundText,
  routeResult,
}: {
  currentContext: Record<string, unknown>;
  inboundText: string;
  routeResult: RouteTicketMessageOutput;
}): RouteTicketMessageOutput {
  const currentIsAdmin = isAdminState(currentContext.state);
  const nextIsAdmin = isAdminState(routeResult.nextContext.state);
  const existing = readNavigation(currentContext);

  if (currentIsAdmin && isBackCommand(inboundText) && existing?.frames.length) {
    const frames = [...existing.frames];
    const restored = frames.pop()!;
    const activeAdmin = routeResult.nextContext.admin;
    const restoredContext = {
      ...restored.context,
      ...(activeAdmin ? { admin: activeAdmin } : {}),
      updatedAt: new Date().toISOString(),
    } as TicketConversationState;

    return {
      reply: restored.reply,
      nextContext: withNavigation(restoredContext, {
        frames,
        current: restored,
      }),
    };
  }

  if (!nextIsAdmin) {
    const nextContext = { ...routeResult.nextContext };
    delete (nextContext as TicketConversationState & {
      adminNavigation?: AdminNavigationState;
    }).adminNavigation;
    return { ...routeResult, nextContext };
  }

  const nextSnapshot = stripNavigationMetadata(
    routeResult.nextContext as unknown as Record<string, unknown>,
  );
  const nextFrame: AdminNavigationFrame = {
    context: nextSnapshot,
    reply: isSensitiveAdminState(currentContext.state) ? "" : routeResult.reply,
    stackable: !isSensitiveAdminState(currentContext.state),
  };

  if (!existing || !currentIsAdmin || isResetCommand(inboundText)) {
    return {
      ...routeResult,
      nextContext: withNavigation(routeResult.nextContext, {
        frames: [],
        current: nextFrame,
      }),
    };
  }

  const frames = [...existing.frames];
  if (
    existing.current.stackable !== false &&
    !sameScreen(existing.current.context, nextSnapshot)
  ) {
    frames.push(existing.current);
  }

  return {
    ...routeResult,
    nextContext: withNavigation(routeResult.nextContext, {
      frames: frames.slice(-MAX_ADMIN_NAVIGATION_DEPTH),
      current: nextFrame,
    }),
  };
}
