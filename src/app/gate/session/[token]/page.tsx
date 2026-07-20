import { GateSessionScanner } from "./GateSessionScanner";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";
import { buildPublicGateSessionDtoWithSummary } from "@/lib/tickets/services/publicDtos";

type GateSessionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function GateSessionPage({ params }: GateSessionPageProps) {
  const { token } = await params;
  const initialValidation = await validateGateSessionToken(token);
  const publicValidation =
    await buildPublicGateSessionDtoWithSummary(initialValidation);

  return <GateSessionScanner initialValidation={publicValidation} />;
}
