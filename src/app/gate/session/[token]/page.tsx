import { GateSessionScanner } from "./GateSessionScanner";

type GateSessionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function GateSessionPage({ params }: GateSessionPageProps) {
  const { token } = await params;

  return <GateSessionScanner token={token} />;
}

