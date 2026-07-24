import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_WEB_AUTH_COOKIES,
  getAdminWebSessionFromCookieWithOptions,
  hasAdminPermission,
  type AdminWebSession,
} from "@/lib/tickets/services/adminAuth";

export async function requireAdminEventEditorSession() {
  const startedAt = performance.now();
  const cookieStore = await cookies();
  const cookieReadAt = performance.now();
  const result = await getAdminWebSessionFromCookieWithOptions(
    cookieStore.get(ADMIN_WEB_AUTH_COOKIES.session)?.value,
    { touchLastUsed: false },
  );
  const resolvedAt = performance.now();

  if (!result.ok || !result.adminWebSession) {
    return {
      ok: false as const,
      reason: "unauthorized" as const,
      metrics: {
        cookieMs: Math.round(cookieReadAt - startedAt),
        resolveMs: Math.round(resolvedAt - cookieReadAt),
        totalMs: Math.round(resolvedAt - startedAt),
        supabaseOperations: 1,
      },
    };
  }

  if (!hasAdminPermission(result.adminWebSession.adminUser.role, "manage_events")) {
    return {
      ok: false as const,
      reason: "forbidden" as const,
      metrics: {
        cookieMs: Math.round(cookieReadAt - startedAt),
        resolveMs: Math.round(resolvedAt - cookieReadAt),
        totalMs: Math.round(resolvedAt - startedAt),
        supabaseOperations: 1,
      },
    };
  }

  return {
    ok: true as const,
    session: result.adminWebSession,
    metrics: {
      cookieMs: Math.round(cookieReadAt - startedAt),
      resolveMs: Math.round(resolvedAt - cookieReadAt),
      totalMs: Math.round(resolvedAt - startedAt),
      supabaseOperations: 1,
    },
  };
}

export function assertAdminCsrf(request: Request, session: AdminWebSession) {
  const headerToken = request.headers.get("x-admin-csrf")?.trim() ?? "";

  return Boolean(headerToken && headerToken === session.csrfToken);
}
