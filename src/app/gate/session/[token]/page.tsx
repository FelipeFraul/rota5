import { GateSessionScanner } from "./GateSessionScanner";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";
import { buildPublicGateSessionDto } from "@/lib/tickets/services/publicDtos";

type GateSessionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function GateSessionPage({ params }: GateSessionPageProps) {
  const { token } = await params;
  const initialValidation = await validateGateSessionToken(token);

  return (
    <GateSessionScanner
      initialValidation={buildPublicGateSessionDto(initialValidation)}
    />
  );
}
