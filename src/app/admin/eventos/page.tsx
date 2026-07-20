import { redirect } from "next/navigation";
import { requireAdminEventEditorSession } from "@/lib/tickets/services/adminWebAuth";
import { AdminEventsEditor } from "./AdminEventsEditor";

export default async function AdminEventosPage() {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    redirect("/");
  }

  return (
    <main className="admin-events-shell">
      <AdminEventsEditor />
    </main>
  );
}
