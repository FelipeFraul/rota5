"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "@/app/BrandLogo";
import AdminEventGrid, { type AdminEventCardItem } from "./components/AdminEventGrid";
import AdminEventsToolbar from "./components/AdminEventsToolbar";

const AdminComboOffersSection = dynamic(() => import("./combo-editor/AdminComboOffersSection"), {
  loading: () => null,
});
const AdminDashboardSection = dynamic(() => import("./dashboard/AdminDashboardSection"), {
  loading: () => null,
});
const EventEditorModal = dynamic(() => import("./event-editor/EventEditorModal"), {
  loading: () => null,
});

export type ActiveTab = "event" | "sessions" | "sections" | "prices" | "courtesy" | "tableMap";

export type EventSummary = {
  eventId: string;
  title: string;
  artistName: string;
  city: string;
  state: string;
  status: EventStatus;
  displayStatus: EventStatus;
  imageUrl: string | null;
  venueName: string | null;
  sessionsCount: number;
  nextSessionStartsAt: string | null;
  nextSessionStatus: string | null;
  ticketImpressions: number;
  ticketClicks: number;
  ticketItemsSold?: number;
  ticketRevenueCents?: number;
  ticketSalesOverview: Array<{
    key: string;
    label: string;
    shortLabel: string;
    sold: number;
    available: number;
    courtesySold?: number;
    courtesyAvailable?: number;
    courtesyCapacity?: number;
    salesSold?: number;
    salesAvailable?: number;
    salesCapacity?: number;
  }>;
};

export type ComboOfferSummary = {
  offerId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  originalPriceCents: number | null;
  priceCents: number;
  displayPriority: number;
  status: "active" | "paused" | string;
  sendTimingType: ComboOfferTimingType;
  sendOffsetMinutes: number | null;
  timingLabel: string;
  scopeLabel: string;
  scopeType: "all_events" | "event" | "weekday";
  eventIds: string[];
  weekdays: number[];
  createdAt: string;
  paidOrders: number;
  impressions: number;
  clicks: number;
  itemsSold: number;
  revenueCents: number;
};

export type EventStatus = "draft" | "published" | "cancelled" | "finished";
export type EventFilterStatus = EventStatus | "all" | "paused";
export type SessionStatus = "scheduled" | "sales_open" | "sales_closed" | "cancelled" | "finished";
export type SectionStatus = "active" | "inactive";
export type PriceStatus = "active" | "inactive";
export type AdminViewFilter = "tickets" | "combos" | "all";
export type ComboOfferTimingType = "three_hours_before" | "one_hour_before" | "event_day_noon" | "custom";

export type ComboOfferDraft = {
  name: string;
  description: string;
  imageUrl: string;
  originalPrice: string;
  price: string;
  displayPriority: number;
  status: "active" | "paused";
  timingType: ComboOfferTimingType;
  customOffsetMinutes: number;
  scopeType: "all_events" | "event" | "weekday";
  eventIds: string[];
  weekdays: number[];
};

export type SaveFeedback = {
  state: "loading" | "success";
  label: string;
};

export type ContactActivityContact = EventDashboard["contactActivity"]["contacts"][number];

export type EventDetails = EventSummary & {
  description: string | null;
  venueId: string | null;
  createdAt: string;
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    status: SessionStatus;
    venueId: string | null;
    venueName: string | null;
  }>;
  sections: Array<{
    sectionId: string;
    name: string;
    slug: string;
    capacity: number | null;
    hasNumberedSeats: boolean;
    status: SectionStatus;
  }>;
  prices: Array<{
    priceId: string;
    sessionId: string;
    sectionId: string | null;
    sectionName: string | null;
    ticketType: string;
    label: string;
    priceCents: number;
    feeCents: number;
    currency: string;
    salesStartAt: string | null;
    salesEndAt: string | null;
    status: PriceStatus;
  }>;
  courtesy: {
    sections: Array<{
      sectionId: string;
      sectionName: string;
      label: string;
      limit: number;
      status: SectionStatus;
    }>;
  };
};

export type Draft = {
  event: {
    title: string;
    artistName: string;
    city: string;
    state: string;
    venueName: string;
    description: string;
    imageUrl: string;
    status: EventStatus;
  };
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    status: SessionStatus;
  }>;
  sections: Array<{
    sectionId: string;
    name: string;
    capacity: number | null;
    status: SectionStatus;
  }>;
  newSections: Array<{
    clientId: string;
    name: string;
    capacity: number;
  }>;
  prices: Array<{
    priceId: string;
    sectionId: string | null;
    sectionName: string | null;
    label: string;
    price: string;
    fee: string;
    salesStartAt: string | null;
    salesEndAt: string | null;
    status: PriceStatus;
  }>;
  courtesy: {
    sections: Array<{
      sectionId: string;
      sectionName: string;
      label: string;
      limit: number;
      status: SectionStatus;
    }>;
  };
};

export type EventDashboard = {
  range: ContactRange;
  summary: {
    soldTickets: number;
    capacity: number;
    available: number;
    reserved: number;
    blocked: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    comboRevenueCents: number;
    totalRevenueCents: number;
    checkins: number;
    usedTickets: number;
    comboOrdersPaid: number;
    comboOrdersPending: number;
    comboItemsSold: number;
    comboIssued: number;
    comboUsed: number;
  };
  sections: Array<{
    sectionId: string;
    name: string;
    capacity: number;
    sold: number;
    reserved: number;
    blocked: number;
    available: number;
    revenueCents: number;
    occupancyPercent: number;
  }>;
  dailySales: Array<{
    key: string;
    label: string;
    ticketsSold: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    comboRevenueCents: number;
    sections: Array<{
      sectionId: string;
      sectionName: string;
      quantity: number;
      revenueCents: number;
    }>;
  }>;
  sixHourSales: Array<{
    dayKey: string;
    endHour: number;
    ticketsSold: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    sections: Array<{
      sectionId: string;
      sectionName: string;
      quantity: number;
      revenueCents: number;
    }>;
  }>;
  contactActivity: {
    range: ContactRange;
    periodLabel: string;
    dayKey: string;
    totalUniqueContacts: number;
    totalMessages: number;
    peakEndHour: number | null;
    peakUniqueContacts: number;
    intervals: Array<{
      endHour: number;
      uniqueContacts: number;
      messagesReceived: number;
    }>;
    points: Array<{
      key: string;
      label: string;
      intervalLabel?: string;
      positionHour?: number;
      uniqueContacts: number;
      messagesReceived: number;
    }>;
    peakLabel: string | null;
    contacts: Array<{
      customerId: string;
      name: string | null;
      phone: string;
      messageCount: number;
      firstContactAt: string;
      lastContactAt: string;
      purchasedTicket: boolean;
      stoppedAtState: string;
      stoppedAtLabel: string;
      lastInboundMessage: string | null;
      lastOutboundMessage: string | null;
      conversationMessages: Array<{
        direction: "inbound" | "outbound";
        body: string;
        createdAt: string;
        outboundStatus?: "sent" | "failed" | "unknown";
        providerMessageId?: string | null;
      }>;
      purchasedEvents: Array<{
        sessionId: string;
        name: string;
        startsAt: string;
      }>;
    }>;
  };
  combos: {
    offers: Array<{
      name: string;
      quantity: number;
      revenueCents: number;
    }>;
  };
};

export type DashboardState = {
  event: EventSummary;
  data: EventDashboard | null;
  loading: boolean;
  message: string | null;
};

export type GeneralDashboardPeriod = {
  key: string;
  label: string;
  intervalLabel?: string;
  positionHour?: number;
  ticketsSold: number;
  capacity: number;
  ticketRevenueCents: number;
  comboRevenueCents: number;
  totalRevenueCents: number;
  comboItemsSold: number;
  comboUsed: number;
  comboOrdersPending: number;
  checkins: number;
  courtesyTickets: number;
  repasseCents: number;
};

export type GeneralDashboard = {
  today: GeneralDashboardPeriod;
  fridayWindow: GeneralDashboardPeriod;
  sixHour: GeneralDashboardPeriod[];
  daily: GeneralDashboardPeriod[];
  weekly: GeneralDashboardPeriod[];
  monthly: GeneralDashboardPeriod[];
  contactActivity: EventDashboard["contactActivity"];
};

export type GeneralDashboardRange = "day" | "week" | "30" | "60" | "total";
export type ContactRange = GeneralDashboardRange;

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("admin_web_csrf="))
    ?.split("=")[1] ?? "";
}

export function AdminEventsEditor() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [viewFilter, setViewFilter] = useState<AdminViewFilter>("tickets");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<EventFilterStatus>("published");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [duplicatingEventId, setDuplicatingEventId] = useState<string | null>(null);
  const [dashboardEventId, setDashboardEventId] = useState<string | null>(null);
  const [comboSectionMounted, setComboSectionMounted] = useState(false);
  const loadEventsAbortRef = useRef<AbortController | null>(null);
  const loadEventsRequestRef = useRef(0);
  const editingEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    editingEventIdRef.current = editingEventId;
  }, [editingEventId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (dashboardEventId) {
        setDashboardEventId(null);
        return;
      }

      if (editingEventId) {
        setEditingEventId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dashboardEventId, editingEventId]);

  const loadEvents = useCallback(async (options?: { search?: string; status?: EventFilterStatus }) => {
    const requestId = loadEventsRequestRef.current + 1;
    loadEventsRequestRef.current = requestId;
    loadEventsAbortRef.current?.abort();
    const controller = new AbortController();
    loadEventsAbortRef.current = controller;
    setLoading(true);

    try {
      const requestedStatus = options?.status ?? status;
      const requestedSearch = options?.search ?? appliedSearch;
      const params = new URLSearchParams({ status: requestedStatus });
      if (requestedSearch.trim()) params.set("search", requestedSearch.trim());
      params.set("fast", "1");
      const response = await fetch(`/api/admin/events?${params.toString()}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      const data = await response.json() as {
        ok?: boolean;
        events?: EventSummary[];
        message?: string;
      };

      if (requestId !== loadEventsRequestRef.current) return;

      if (!response.ok || !data.ok) {
        const sessionMessage =
          response.status === 401 || response.status === 403
            ? "Sessão expirada. Abra um novo link pelo WhatsApp."
            : null;

        setMessage(data.message ?? sessionMessage ?? "Não foi possível carregar os eventos.");
        if (sessionMessage) {
          setEvents([]);
        }
        return;
      }

      setEvents(data.events ?? []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Não foi possível carregar os eventos.");
    } finally {
      if (requestId === loadEventsRequestRef.current) {
        setLoading(false);
      }
    }
  }, [appliedSearch, status]);

  const openEvent = useCallback((eventId: string) => {
    setMessage(null);
    setEditingEventId(eventId);
  }, []);

  const deleteEvent = useCallback(async (eventId: string) => {
    const confirmed = window.confirm("Excluir este evento da área pública? O histórico será preservado como cancelado.");
    if (!confirmed) return;

    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
      });
      const data = await response.json() as { ok?: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Não foi possível excluir o evento.");
        return;
      }

      if (editingEventIdRef.current === eventId) {
        setEditingEventId(null);
      }

      setMessage(null);
      await loadEvents();
    } catch {
      setMessage("Não foi possível excluir o evento.");
    }
  }, [loadEvents]);

  const duplicateEvent = useCallback(async (eventId: string) => {
    const confirmed = window.confirm("Duplicar este evento como rascunho?");
    if (!confirmed) return;

    setDuplicatingEventId(eventId);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
      });
      const data = await response.json() as { ok?: boolean; eventId?: string; event?: EventDetails; message?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.message ?? "Não foi possível duplicar o evento.");
        return;
      }

      setMessage(null);
      await loadEvents();

      openEvent(data.event?.eventId ?? data.eventId ?? eventId);
    } catch {
      setMessage("Não foi possível duplicar o evento.");
    } finally {
      setDuplicatingEventId(null);
    }
  }, [loadEvents, openEvent]);

  const eventCardItems = useMemo<AdminEventCardItem[]>(() => (
    events.map((event) => ({
      eventId: event.eventId,
      title: event.title,
      city: event.city,
      state: event.state,
      displayStatus: event.displayStatus,
      imageUrl: event.imageUrl,
      nextSessionStartsAt: event.nextSessionStartsAt,
      ticketImpressions: event.ticketImpressions,
      ticketClicks: event.ticketClicks,
      ticketItemsSold: event.ticketItemsSold ?? 0,
      ticketRevenueCents: event.ticketRevenueCents ?? 0,
    }))
  ), [events]);

  const eventsById = useMemo(() => (
    new Map(events.map((event) => [event.eventId, event]))
  ), [events]);

  const handleOpenEvent = useCallback((eventId: string) => {
    void openEvent(eventId);
  }, [openEvent]);

  const handleDuplicateEvent = useCallback((eventId: string) => {
    void duplicateEvent(eventId);
  }, [duplicateEvent]);

  const handleDeleteEvent = useCallback((eventId: string) => {
    void deleteEvent(eventId);
  }, [deleteEvent]);

  const handleOpenDashboard = useCallback((eventId: string) => {
    setDashboardEventId(eventId);
  }, []);

  const handleCloseDashboard = useCallback(() => {
    setDashboardEventId(null);
  }, []);

  const handleDashboardError = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
  }, []);

  const handleSearch = useCallback((nextSearch: string) => {
    setAppliedSearch(nextSearch);
  }, []);

  const handleRefreshSearch = useCallback((nextSearch: string) => {
    void loadEvents({ search: nextSearch });
  }, [loadEvents]);

  const handleStatusChange = useCallback((nextStatus: EventFilterStatus) => {
    setStatus(nextStatus);
  }, []);

  const handleViewFilterChange = useCallback((nextViewFilter: AdminViewFilter) => {
    if (nextViewFilter !== "tickets") setComboSectionMounted(true);
    setViewFilter(nextViewFilter);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadEvents]);

  return (
    <>
      <header className="admin-events-header">
        <BrandLogo />
        <div>
          <h1>Editar eventos</h1>
        </div>
      </header>

      <AdminDashboardSection
        event={dashboardEventId ? eventsById.get(dashboardEventId) ?? null : null}
        onCloseEventDashboard={handleCloseDashboard}
        onError={handleDashboardError}
      />

      <AdminEventsToolbar
        appliedSearch={appliedSearch}
        status={status}
        viewFilter={viewFilter}
        eventCount={events.length}
        onSearch={handleSearch}
        onRefreshSearch={handleRefreshSearch}
        onStatusChange={handleStatusChange}
        onViewFilterChange={handleViewFilterChange}
      />

      {message ? <p className="admin-events-message">{message}</p> : null}

      {viewFilter !== "combos" ? (
        <AdminEventGrid
          events={eventCardItems}
          loading={loading}
          duplicatingEventId={duplicatingEventId}
          onOpenEvent={handleOpenEvent}
          onDuplicateEvent={handleDuplicateEvent}
          onOpenDashboard={handleOpenDashboard}
          onDeleteEvent={handleDeleteEvent}
        />
      ) : null}

      {comboSectionMounted ? (
        <AdminComboOffersSection events={events} visible={viewFilter !== "tickets"} />
      ) : null}

      {editingEventId ? (
        <EventEditorModal
          eventId={editingEventId}
          onClose={() => setEditingEventId(null)}
          onSaved={loadEvents}
        />
      ) : null}

    </>
  );
}


