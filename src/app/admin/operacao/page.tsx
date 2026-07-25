import { redirect } from "next/navigation";
import { requireAdminEventEditorSession } from "@/lib/tickets/services/adminWebAuth";
import OperationalDashboardSection from "./OperationalDashboardSection";

export default async function AdminOperacaoPage() {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    redirect("/");
  }

  return (
    <main className="admin-events-shell">
      <OperationalDashboardSection />
    </main>
  );
}
