"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ContactRange, DashboardState, EventDashboard, EventSummary, GeneralDashboard } from "../AdminEventsEditor";

const EventDashboardModal = dynamic(() => import("./EventDashboardModal"), {
  loading: () => null,
});
const GeneralDashboardModal = dynamic(() => import("./GeneralDashboardModal"), {
  loading: () => null,
});
const ContactsModal = dynamic(() => import("../contacts/ContactsModal"), {
  loading: () => null,
});

export type AdminDashboardSectionProps = {
  event: EventSummary | null;
  onCloseEventDashboard: () => void;
  onError: (message: string) => void;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

const GeneralDashboardCards = memo(function GeneralDashboardCards({
  dashboard,
  onOpen,
}: {
  dashboard: GeneralDashboard | null;
  onOpen: () => void;
}) {
  const today = dashboard?.today;

  return (
    <section className="admin-general-kpis" aria-label="Vendas totais do dia">
      {today ? (
        <>
          <article>
            <span>Receita</span>
            <strong>{formatCurrency(today.totalRevenueCents)}</strong>
            <small>Ingressos {formatCurrency(today.ticketRevenueCents)} · Combos {formatCurrency(today.comboRevenueCents)}</small>
          </article>
          <article>
            <span>Ingressos</span>
            <strong>{formatInteger(today.ticketsSold)}</strong>
            <small>{formatInteger(today.courtesyTickets)} cortesias emitidas</small>
          </article>
          <article>
            <span>Check-in</span>
            <strong>{formatInteger(today.checkins)}</strong>
            <small>Entradas realizadas hoje</small>
          </article>
        </>
      ) : null}
      <button type="button" className="admin-general-plus-card" onClick={onOpen} aria-label="Abrir geral de todos os eventos">
        <PlusIcon />
        <span>Geral</span>
      </button>
    </section>
  );
});

function AdminDashboardSectionComponent({
  event,
  onCloseEventDashboard,
  onError,
}: AdminDashboardSectionProps) {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [generalDashboard, setGeneralDashboard] = useState<GeneralDashboard | null>(null);
  const [generalDashboardOpen, setGeneralDashboardOpen] = useState(false);
  const [generalDashboardLoading, setGeneralDashboardLoading] = useState(false);
  const [generalDashboardMessage, setGeneralDashboardMessage] = useState<string | null>(null);
  const [generalContactActivityByRange, setGeneralContactActivityByRange] = useState<Partial<Record<ContactRange, EventDashboard["contactActivity"]>>>({});
  const [generalContactsLoadingRange, setGeneralContactsLoadingRange] = useState<ContactRange | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [eventDashboardRangeLoading, setEventDashboardRangeLoading] = useState(false);

  useEffect(() => {
    if (!event) return;

    let active = true;
    const selectedEvent = event;

    async function loadDashboard() {
      setContactsOpen(false);
      setDashboard({ event: selectedEvent, data: null, loading: true, message: null });

      try {
        const response = await fetch(`/api/admin/events/${selectedEvent.eventId}?dashboard=1`, {
          credentials: "same-origin",
        });
        const data = await response.json() as { ok?: boolean; dashboard?: EventDashboard; message?: string };

        if (!active) return;

        if (!response.ok || !data.ok || !data.dashboard) {
          setDashboard({ event: selectedEvent, data: null, loading: false, message: data.message ?? "Não foi possível carregar a dashboard." });
          return;
        }

        setDashboard({ event: selectedEvent, data: data.dashboard, loading: false, message: null });
      } catch {
        if (active) setDashboard({ event: selectedEvent, data: null, loading: false, message: "Não foi possível carregar a dashboard." });
      }
    }

    const timeout = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [event]);

  useEffect(() => {
    function handleKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key !== "Escape") return;
      if (contactsOpen) return;
      if (dashboard) onCloseEventDashboard();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contactsOpen, dashboard, onCloseEventDashboard]);

  const loadGeneralDashboard = useCallback(async () => {
    if (generalDashboard || generalDashboardLoading) return;
    setGeneralDashboardLoading(true);
    setGeneralDashboardMessage(null);

    try {
      const response = await fetch("/api/admin/events?generalDashboard=1", {
        credentials: "same-origin",
      });
      const result = await response.json() as {
        ok?: boolean;
        dashboard?: GeneralDashboard;
        message?: string;
      };

      if (!response.ok || !result.ok || !result.dashboard) {
        setGeneralDashboardMessage(result.message ?? "Não foi possível carregar o dashboard geral.");
        return;
      }

      setGeneralDashboard(result.dashboard);
    } catch {
      setGeneralDashboardMessage("Não foi possível carregar o dashboard geral.");
    } finally {
      setGeneralDashboardLoading(false);
    }
  }, [generalDashboard, generalDashboardLoading]);

  useEffect(() => {
    // The dashboard fetch updates local state when its request resolves.`n    // eslint-disable-next-line react-hooks/set-state-in-effect`n    void loadGeneralDashboard();
  }, [loadGeneralDashboard]);

  const loadGeneralContacts = useCallback(async (range: ContactRange) => {
    if (generalContactActivityByRange[range] || generalContactsLoadingRange === range) return;
    setGeneralContactsLoadingRange(range);

    try {
      const response = await fetch(`/api/admin/events?contacts=1&range=${range}`, {
        credentials: "same-origin",
      });
      const result = await response.json() as {
        ok?: boolean;
        contactActivity?: EventDashboard["contactActivity"];
      };

      if (response.ok && result.ok && result.contactActivity) {
        setGeneralContactActivityByRange((current) => ({
          ...current,
          [range]: result.contactActivity!,
        }));
      }
    } catch (error) {
      console.error("Não foi possível atualizar os contatos.", error);
    } finally {
      setGeneralContactsLoadingRange((current) => current === range ? null : current);
    }
  }, [generalContactActivityByRange, generalContactsLoadingRange]);

  const openGeneralDashboard = useCallback(() => {
    setGeneralDashboardOpen(true);
    // The dashboard fetch updates local state when its request resolves.`n    // eslint-disable-next-line react-hooks/set-state-in-effect`n    void loadGeneralDashboard();
  }, [loadGeneralDashboard]);

  const closeGeneralDashboard = useCallback(() => {
    setGeneralDashboardOpen(false);
  }, []);

  const openContacts = useCallback(() => {
    setContactsOpen(true);
  }, []);

  const closeContacts = useCallback(() => {
    setContactsOpen(false);
  }, []);

  const closeEventDashboard = useCallback(() => {
    setContactsOpen(false);
    onCloseEventDashboard();
  }, [onCloseEventDashboard]);

  const changeEventDashboardRange = useCallback(async (range: ContactRange) => {
    if (!dashboard?.data || dashboard.data.range === range || eventDashboardRangeLoading) return;
    setEventDashboardRangeLoading(true);

    try {
      const response = await fetch(`/api/admin/events/${dashboard.event.eventId}?dashboard=1&range=${range}`, {
        credentials: "same-origin",
      });
      const result = await response.json() as {
        ok?: boolean;
        dashboard?: EventDashboard;
        message?: string;
      };
      if (!response.ok || !result.ok || !result.dashboard) {
        onError(result.message ?? "Não foi possível atualizar o período.");
        return;
      }
      setDashboard((current) => current ? { ...current, data: result.dashboard!, message: null } : current);
    } catch {
      onError("Não foi possível atualizar o período.");
    } finally {
      setEventDashboardRangeLoading(false);
    }
  }, [dashboard, eventDashboardRangeLoading, onError]);

  return (
    <>
      <GeneralDashboardCards dashboard={generalDashboard} onOpen={openGeneralDashboard} />

      {event && dashboard ? (
        <EventDashboardModal
          dashboard={dashboard}
          rangeLoading={eventDashboardRangeLoading}
          onClose={closeEventDashboard}
          onOpenContacts={openContacts}
          onRangeChange={(range) => void changeEventDashboardRange(range)}
        />
      ) : null}

      {event && dashboard?.data && contactsOpen ? (
        <ContactsModal activity={dashboard.data.contactActivity} title={`Contatos compradores — ${dashboard.event.title}`} onClose={closeContacts} />
      ) : null}

      {generalDashboardOpen && generalDashboard ? (
        <GeneralDashboardModal
          dashboard={generalDashboard}
          contactActivityByRange={generalContactActivityByRange}
          contactsLoadingRange={generalContactsLoadingRange}
          onLoadContacts={loadGeneralContacts}
          onClose={closeGeneralDashboard}
        />
      ) : null}

      {generalDashboardOpen && !generalDashboard ? (
        <div className="admin-event-modal admin-dashboard-modal" role="dialog" aria-modal="true" aria-label="Geral de todos os eventos">
          <section className="admin-dashboard-panel admin-general-panel">
            <header className="admin-dashboard-header">
              <div>
                <p className="admin-events-kicker">Geral</p>
                <h2>Todos os eventos</h2>
              </div>
              <button type="button" className="admin-event-icon-button" onClick={closeGeneralDashboard} aria-label="Fechar">&times;</button>
            </header>
            {generalDashboardLoading ? <p className="admin-dashboard-empty">Carregando dashboard...</p> : null}
            {!generalDashboardLoading && generalDashboardMessage ? <p className="admin-dashboard-error">{generalDashboardMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

const AdminDashboardSection = memo(AdminDashboardSectionComponent);

export default AdminDashboardSection;
