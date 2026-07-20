import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_WEB_AUTH_COOKIES,
  getAdminWebSessionFromCookie,
  hasAdminPermission,
  type AdminWebSession,
} from "@/lib/tickets/services/adminAuth";

export async function requireAdminEventEditorSession() {
  const cookieStore = await cookies();
  const result = await getAdminWebSessionFromCookie(
    cookieStore.get(ADMIN_WEB_AUTH_COOKIES.session)?.value,
  );

  if (!result.ok || !result.adminWebSession) {
    return { ok: false as const, reason: "unauthorized" as const };
  }

  if (!hasAdminPermission(result.adminWebSession.adminUser.role, "manage_events")) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  return { ok: true as const, session: result.adminWebSession };
}

export function assertAdminCsrf(request: Request, session: AdminWebSession) {
  const headerToken = request.headers.get("x-admin-csrf")?.trim() ?? "";

  return Boolean(headerToken && headerToken === session.csrfToken);
}
