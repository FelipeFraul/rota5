"use client";

import { memo } from "react";
import AdminEventCard, { type AdminEventCardProps } from "./AdminEventCard";

export type AdminEventCardItem = Omit<
  AdminEventCardProps,
  "duplicating" | "onOpen" | "onDuplicate" | "onOpenDashboard" | "onDelete"
>;

export type AdminEventGridProps = {
  events: AdminEventCardItem[];
  loading: boolean;
  duplicatingEventId: string | null;
  onOpenEvent: (eventId: string) => void;
  onDuplicateEvent: (eventId: string) => void;
  onOpenDashboard: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
};

function AdminEventGridComponent({
  events,
  loading,
  duplicatingEventId,
  onOpenEvent,
  onDuplicateEvent,
  onOpenDashboard,
  onDeleteEvent,
}: AdminEventGridProps) {
  return (
    <section className="admin-events-grid" aria-live="polite">
      {loading ? <p className="admin-events-empty">Carregando eventos...</p> : null}
      {!loading && events.length === 0 ? <p className="admin-events-empty">Nenhum evento encontrado.</p> : null}
      {events.map((event) => (
        <AdminEventCard
          key={event.eventId}
          {...event}
          duplicating={duplicatingEventId === event.eventId}
          onOpen={onOpenEvent}
          onDuplicate={onDuplicateEvent}
          onOpenDashboard={onOpenDashboard}
          onDelete={onDeleteEvent}
        />
      ))}
    </section>
  );
}

const AdminEventGrid = memo(AdminEventGridComponent);

export default AdminEventGrid;
