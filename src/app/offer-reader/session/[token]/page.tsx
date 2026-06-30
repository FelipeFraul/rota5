import { validateKitchenSessionToken } from "@/lib/tickets/services/comboRedemptions";
import { OfferQrScanner } from "./OfferQrScanner";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KITCHEN_READER_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

export default async function OfferReaderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const deviceToken = (await cookies()).get(KITCHEN_READER_DEVICE_COOKIE)?.value;
  if (!deviceToken) {
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}&reader=1`);
  }
  const validation = await validateKitchenSessionToken(token, deviceToken);
  if (!validation.valid && validation.reason === "device_mismatch") {
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}&reader=1`);
  }

  return <OfferQrScanner initialValid={validation.valid} />;
}
