"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminComboOfferGrid, { type AdminComboOfferCardItem } from "../components/AdminComboOfferGrid";
import type {
  ComboOfferDraft,
  ComboOfferSummary,
  ComboOfferTimingType,
  EventSummary,
  SaveFeedback,
} from "../AdminEventsEditor";

const ComboOfferModal = dynamic(() => import("./ComboOfferModal"), {
  loading: () => null,
});
const SaveFeedbackOverlay = dynamic(() => import("../components/SaveFeedbackOverlay"), {
  loading: () => null,
});

export type AdminComboOffersSectionProps = {
  events: EventSummary[];
  visible: boolean;
};

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("admin_web_csrf="))
    ?.split("=")[1] ?? "";
}

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function decimalInputToCents(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatTimingLabel(timingType: ComboOfferTimingType, customOffsetMinutes: number) {
  if (timingType === "custom") {
    const minutes = Number(customOffsetMinutes || 0);
    if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}d antes`;
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h antes`;
    return `${minutes || 1}min antes`;
  }
  if (timingType === "event_day_noon") return "Meio-dia do evento";
  if (timingType === "one_hour_before") return "1h antes do evento";
  if (timingType === "three_hours_before") return "3h antes do evento";
  return timingType;
}

function formatScopeLabel(draft: ComboOfferDraft, events: EventSummary[]) {
  if (draft.scopeType === "all_events") return "Todos os eventos";

  if (draft.scopeType === "event") {
    const eventNames = draft.eventIds
      .map((eventId) => events.find((event) => event.eventId === eventId)?.title)
      .filter(Boolean);

    return eventNames.length
      ? eventNames.slice(0, 2).join(", ") + (eventNames.length > 2 ? ` +${eventNames.length - 2}` : "")
      : "Escopo configurado";
  }

  const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const weekdayNames = draft.weekdays
    .map((weekday) => weekdays[weekday])
    .filter(Boolean);

  return weekdayNames.length ? weekdayNames.join(", ") : "Escopo configurado";
}

function buildDraftFromOffer(offer: ComboOfferSummary): ComboOfferDraft {
  return {
    name: offer.name,
    description: offer.description,
    imageUrl: offer.imageUrl ?? "",
    originalPrice: offer.originalPriceCents ? moneyFromCents(offer.originalPriceCents) : "",
    price: moneyFromCents(offer.priceCents),
    displayPriority: offer.displayPriority || 1,
    status: offer.status === "active" ? "active" : "paused",
    timingType: offer.sendTimingType,
    customOffsetMinutes: offer.sendOffsetMinutes ?? 3,
    scopeType: offer.scopeType,
    eventIds: offer.eventIds,
    weekdays: offer.weekdays,
  };
}

function applyDraftToOffer(
  offer: ComboOfferSummary,
  draft: ComboOfferDraft,
  originalPriceCents: number | null | undefined,
  priceCents: number | null,
  events: EventSummary[],
): ComboOfferSummary {
  return {
    ...offer,
    name: draft.name.trim(),
    description: draft.description,
    imageUrl: draft.imageUrl || null,
    originalPriceCents: originalPriceCents === undefined ? offer.originalPriceCents : originalPriceCents,
    priceCents: priceCents ?? offer.priceCents,
    displayPriority: draft.displayPriority,
    status: draft.status,
    sendTimingType: draft.timingType,
    sendOffsetMinutes: draft.timingType === "custom" ? draft.customOffsetMinutes : offer.sendOffsetMinutes,
    timingLabel: formatTimingLabel(draft.timingType, draft.customOffsetMinutes),
    scopeLabel: formatScopeLabel(draft, events),
    scopeType: draft.scopeType,
    eventIds: draft.scopeType === "event" ? draft.eventIds : [],
    weekdays: draft.scopeType === "weekday" ? draft.weekdays : [],
  };
}

function buildDuplicatedOffer(offer: ComboOfferSummary, offerId: string): ComboOfferSummary {
  return {
    ...offer,
    offerId,
    name: `${offer.name} (cópia)`,
    status: "paused",
    paidOrders: 0,
    impressions: 0,
    clicks: 0,
    itemsSold: 0,
    revenueCents: 0,
    createdAt: new Date().toISOString(),
  };
}

export default function AdminComboOffersSection({ events, visible }: AdminComboOffersSectionProps) {
  const [comboOffers, setComboOffers] = useState<ComboOfferSummary[]>([]);
  const [comboOffersLoaded, setComboOffersLoaded] = useState(false);
  const [comboLoading, setComboLoading] = useState(false);
  const [selectedComboOffer, setSelectedComboOffer] = useState<ComboOfferSummary | null>(null);
  const [comboDraft, setComboDraft] = useState<ComboOfferDraft | null>(null);
  const [comboSaving, setComboSaving] = useState(false);
  const [comboActionId, setComboActionId] = useState<string | null>(null);
  const [comboMessage, setComboMessage] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const loadComboOffersAbortRef = useRef<AbortController | null>(null);
  const loadComboOffersRequestRef = useRef(0);

  const loadComboOffers = useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && comboOffersLoaded) return;
    const requestId = loadComboOffersRequestRef.current + 1;
    loadComboOffersRequestRef.current = requestId;
    loadComboOffersAbortRef.current?.abort();
    const controller = new AbortController();
    loadComboOffersAbortRef.current = controller;
    setComboLoading(true);

    try {
      const response = await fetch("/api/admin/combo-offers", {
        credentials: "same-origin",
        signal: controller.signal,
      });
      const data = await response.json() as {
        ok?: boolean;
        comboOffers?: ComboOfferSummary[];
        message?: string;
      };

      if (requestId !== loadComboOffersRequestRef.current) return;

      if (!response.ok || !data.ok) {
        setComboMessage(data.message ?? "Não foi possível carregar os combos.");
        return;
      }

      setComboOffers(data.comboOffers ?? []);
      setComboOffersLoaded(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setComboMessage("Não foi possível carregar os combos.");
    } finally {
      if (requestId === loadComboOffersRequestRef.current) {
        setComboLoading(false);
      }
    }
  }, [comboOffersLoaded]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadComboOffers();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadComboOffers]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !selectedComboOffer) return;
      setSelectedComboOffer(null);
      setComboDraft(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedComboOffer]);

  const comboOfferCardItems = useMemo<AdminComboOfferCardItem[]>(() => (
    comboOffers.map((offer) => ({
      offerId: offer.offerId,
      name: offer.name,
      imageUrl: offer.imageUrl,
      originalPriceCents: offer.originalPriceCents,
      priceCents: offer.priceCents,
      displayPriority: offer.displayPriority,
      status: offer.status,
      timingLabel: offer.timingLabel,
      scopeLabel: offer.scopeLabel,
      itemsSold: offer.itemsSold,
      revenueCents: offer.revenueCents,
      impressions: offer.impressions,
      clicks: offer.clicks,
    }))
  ), [comboOffers]);

  const comboOffersById = useMemo(() => (
    new Map(comboOffers.map((offer) => [offer.offerId, offer]))
  ), [comboOffers]);

  const openComboOffer = useCallback((offer: ComboOfferSummary) => {
    setSelectedComboOffer(offer);
    setComboDraft(buildDraftFromOffer(offer));
  }, []);

  async function saveComboOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedComboOffer || !comboDraft) return;

    const name = comboDraft.name.trim();
    if (!name) {
      setComboMessage("Informe o nome do combo.");
      return;
    }

    const hasPrice = comboDraft.price.trim().length > 0;
    const priceCents = hasPrice ? decimalInputToCents(comboDraft.price) : null;
    if (hasPrice && (!priceCents || priceCents <= 0)) {
      setComboMessage("Informe um valor válido para o combo ou deixe o campo vazio.");
      return;
    }

    const hasOriginalPrice = comboDraft.originalPrice.trim().length > 0;
    const originalPriceCents = hasOriginalPrice
      ? decimalInputToCents(comboDraft.originalPrice)
      : null;
    if (hasOriginalPrice && (!originalPriceCents || originalPriceCents <= 0)) {
      setComboMessage("Informe um valor De válido ou deixe o campo vazio.");
      return;
    }
    if (originalPriceCents !== null && priceCents !== null && originalPriceCents <= priceCents) {
      setComboMessage("O valor De precisa ser maior que o valor Por.");
      return;
    }

    if (comboDraft.scopeType === "event" && comboDraft.eventIds.length === 0) {
      setComboMessage("Escolha ao menos um evento para este combo.");
      return;
    }

    setComboSaving(true);
    setComboMessage(null);
    setSaveFeedback({ state: "loading", label: "Salvando combo" });

    try {
      const response = await fetch(`/api/admin/combo-offers/${selectedComboOffer.offerId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
        body: JSON.stringify({
          name,
          description: comboDraft.description,
          imageUrl: comboDraft.imageUrl || null,
          originalPriceCents,
          ...(priceCents ? { priceCents } : {}),
          displayPriority: comboDraft.displayPriority,
          status: comboDraft.status,
          timingType: comboDraft.timingType,
          customOffsetMinutes: comboDraft.timingType === "custom" ? comboDraft.customOffsetMinutes : undefined,
          scope: comboDraft.scopeType === "all_events"
            ? { scopeType: "all_events" }
            : comboDraft.scopeType === "event"
              ? { scopeType: "event", eventIds: comboDraft.eventIds }
              : { scopeType: "weekday", weekdays: comboDraft.weekdays },
        }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setComboMessage(result.message ?? "Não foi possível salvar o combo.");
        setSaveFeedback(null);
        return;
      }

      const updatedOffer = applyDraftToOffer(selectedComboOffer, comboDraft, originalPriceCents, priceCents, events);
      setComboOffers((current) => current.map((offer) => offer.offerId === updatedOffer.offerId ? updatedOffer : offer));
      setComboMessage(null);
      setSaveFeedback({ state: "success", label: "Salvo" });
      await wait(650);
      setSelectedComboOffer(null);
      setComboDraft(null);
      setSaveFeedback(null);
    } catch {
      setComboMessage("Não foi possível salvar o combo.");
      setSaveFeedback(null);
    } finally {
      setComboSaving(false);
    }
  }

  const duplicateComboOfferCard = useCallback(async (offer: ComboOfferSummary) => {
    const confirmed = window.confirm("Duplicar este combo como inativo?");
    if (!confirmed) return;

    setComboActionId(offer.offerId);
    setComboMessage(null);

    try {
      const response = await fetch(`/api/admin/combo-offers/${offer.offerId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
      });
      const result = await response.json() as { ok?: boolean; offerId?: string; message?: string };

      if (!response.ok || !result.ok || !result.offerId) {
        setComboMessage(result.message ?? "Não foi possível duplicar o combo.");
        return;
      }

      setComboMessage(null);
      setComboOffers((current) => [buildDuplicatedOffer(offer, result.offerId!), ...current]);
    } catch {
      setComboMessage("Não foi possível duplicar o combo.");
    } finally {
      setComboActionId(null);
    }
  }, []);

  const deleteComboOfferCard = useCallback(async (offer: ComboOfferSummary) => {
    const confirmed = window.confirm("Excluir este combo da venda? O histórico será preservado.");
    if (!confirmed) return;

    setComboActionId(offer.offerId);
    setComboMessage(null);

    try {
      const response = await fetch(`/api/admin/combo-offers/${offer.offerId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
      });
      const result = await response.json() as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) {
        setComboMessage(result.message ?? "Não foi possível excluir o combo.");
        return;
      }

      setComboMessage(null);
      setComboOffers((current) => current.filter((item) => item.offerId !== offer.offerId));
    } catch {
      setComboMessage("Não foi possível excluir o combo.");
    } finally {
      setComboActionId(null);
    }
  }, []);

  const handleOpenComboOffer = useCallback((offerId: string) => {
    const offer = comboOffersById.get(offerId);
    if (offer) openComboOffer(offer);
  }, [comboOffersById, openComboOffer]);

  const handleDuplicateComboOffer = useCallback((offerId: string) => {
    const offer = comboOffersById.get(offerId);
    if (offer) void duplicateComboOfferCard(offer);
  }, [comboOffersById, duplicateComboOfferCard]);

  const handleDeleteComboOffer = useCallback((offerId: string) => {
    const offer = comboOffersById.get(offerId);
    if (offer) void deleteComboOfferCard(offer);
  }, [comboOffersById, deleteComboOfferCard]);

  return (
    <section hidden={!visible}>
      {comboMessage ? <p className="admin-events-message">{comboMessage}</p> : null}

      <AdminComboOfferGrid
        offers={comboOfferCardItems}
        loading={comboLoading}
        loaded={comboOffersLoaded}
        actionId={comboActionId}
        onEdit={handleOpenComboOffer}
        onDuplicate={handleDuplicateComboOffer}
        onDelete={handleDeleteComboOffer}
      />

      {selectedComboOffer && comboDraft ? (
        <ComboOfferModal
          offer={selectedComboOffer}
          draft={comboDraft}
          events={events}
          saving={comboSaving}
          onClose={() => {
            setSelectedComboOffer(null);
            setComboDraft(null);
          }}
          onDraftChange={setComboDraft}
          onSubmit={saveComboOffer}
        />
      ) : null}

      {saveFeedback ? (
        <SaveFeedbackOverlay feedback={saveFeedback} />
      ) : null}
    </section>
  );
}
