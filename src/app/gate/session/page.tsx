import { cookies } from "next/headers";
import { GateSessionScanner } from "./[token]/GateSessionScanner";
import { GATE_SESSION_COOKIE } from "@/lib/http/accessCookies";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";
import { buildPublicGateSessionDto } from "@/lib/tickets/services/publicDtos";

export default async function GateSessionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(GATE_SESSION_COOKIE)?.value ?? "";
  const initialValidation = token
    ? await validateGateSessionToken(token)
    : { valid: false as const, reason: "not_found" as const };

  return (
    <GateSessionScanner
      initialValidation={buildPublicGateSessionDto(initialValidation)}
    />
  );
}
