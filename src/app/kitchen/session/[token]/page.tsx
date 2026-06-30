import { KitchenSessionScanner } from "./KitchenSessionScanner";
import { validateKitchenOrdersToken } from "@/lib/tickets/services/comboRedemptions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KITCHEN_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

type KitchenSessionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function KitchenSessionPage({ params }: KitchenSessionPageProps) {
  const { token } = await params;
  const deviceToken = (await cookies()).get(KITCHEN_DEVICE_COOKIE)?.value;
  if (!deviceToken) {
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}`);
  }
  const initialValidation = await validateKitchenOrdersToken(token, deviceToken);
  if (!initialValidation.valid && initialValidation.reason === "device_mismatch") {
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}`);
  }

  return <KitchenSessionScanner initialValidation={initialValidation} />;
}
