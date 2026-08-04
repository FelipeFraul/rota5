"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { InformationPage } from "@/app/InformationPage";

type KitchenStatus = "pending" | "preparing" | "delivered";
type KitchenOrder = {
  redemptionId: string;
  redemptionCode: string;
  offerName: string;
  offerDescription: string;
  quantity: number;
  status: "issued" | "used" | "cancelled";
  issuedAt: string;
  usedAt: string | null;
  paidAt: string | null;
  customerName: string | null;
  customerPhoneLast4: string | null;
  eventId: string;
  eventTitle: string;
  sessionStartsAt: string;
  kitchenStatus: KitchenStatus;
  arrivedAt: string | null;
  kitchenReleasedAt: string | null;
  preparingAt: string | null;
  readyNotifiedAt: string | null;
  deliveredAt: string | null;
};

type Validation =
  | {
      valid: true;
      kitchenSession: {
        eventTitle: string | null;
        sessionStartsAt: string | null;
        kitchenLabel: string | null;
      };
      summary: {
        pendingCount: number;
        redeemedCount: number;
        totalQuantity: number;
      };
      events: Array<{
        eventId: string;
        title: string;
        startsAt: string;
      }>;
      orders: KitchenOrder[];
    }
  | { valid: false; reason: string };

const REFRESH_INTERVAL_MS = 5_000;

function routeToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatTime(value: string | null) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEventDate(value: string) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function saoPauloDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function orderStatusTime(order: KitchenOrder) {
  if (order.kitchenStatus === "delivered") {
    return order.deliveredAt ?? order.usedAt ?? order.preparingAt ?? order.issuedAt;
  }
  if (order.kitchenStatus === "preparing") {
    return order.preparingAt ?? order.arrivedAt ?? order.kitchenReleasedAt ?? order.issuedAt;
  }
  return order.arrivedAt ?? order.kitchenReleasedAt ?? order.paidAt ?? order.issuedAt;
}

function OrderCard({
  order,
  working,
  onPrepare,
}: {
  order: KitchenOrder;
  working: boolean;
  onPrepare: (redemptionId: string) => void;
}) {
  const items = order.offerDescription.split("\n").filter(Boolean);

  return (
    <article className="kitchen-order-card">
      <div className="kitchen-order-card-header">
        <span>Pedido {order.redemptionCode}</span>
        <time>{formatTime(orderStatusTime(order))}</time>
      </div>
      <h3>{order.offerName}</h3>

      <section className="kitchen-order-items">
        <h4>Itens para produzir</h4>
        {items.length ? (
          <ul>
            {items.map((item, index) => (
              <li key={`${order.redemptionId}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Composicao nao informada. Consulte o nome da oferta.</p>
        )}
      </section>

      <dl>
        <div>
          <dt>Cliente</dt>
          <dd>{order.customerName ?? "Nao informado"}</dd>
        </div>
        {order.customerPhoneLast4 ? (
          <div>
            <dt>Telefone</dt>
            <dd>final {order.customerPhoneLast4}</dd>
          </div>
        ) : null}
      </dl>

      {order.kitchenStatus === "pending" ? (
        <button
          type="button"
          className="kitchen-complete-button"
          disabled={working}
          onClick={() => onPrepare(order.redemptionId)}
        >
          {working ? "Avisando cliente..." : "Colocar em preparo e avisar"}
        </button>
      ) : order.kitchenStatus === "preparing" ? (
        order.readyNotifiedAt ? (
          <p className="kitchen-waiting-label">
            Cliente avisado. Aguardando retirada pelo leitor de QR da oferta
          </p>
        ) : (
          <>
            <p className="kitchen-waiting-label">
              O aviso de retirada ainda não foi confirmado.
            </p>
            <button
              type="button"
              className="kitchen-complete-button"
              disabled={working}
              onClick={() => onPrepare(order.redemptionId)}
            >
              {working ? "Reenviando aviso..." : "Reenviar aviso e QR"}
            </button>
          </>
        )
      ) : (
        <p className="kitchen-delivered-at">
          Entregue as {formatTime(order.deliveredAt ?? order.usedAt)}
        </p>
      )}
    </article>
  );
}

export function KitchenSessionScanner({
  initialValidation,
}: {
  initialValidation: Validation;
}) {
  const params = useParams<{ token?: string | string[] }>();
  const token = routeToken(params.token);
  const [validation, setValidation] = useState<Validation>(initialValidation);
  const [eventId, setEventId] = useState("all");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/kitchen/session/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      const result = (await response.json()) as Validation;
      if (!result.valid && result.reason === "service_unavailable") {
        setNotice("Atualização temporariamente indisponível. Mantendo os pedidos na tela.");
        return;
      }
      setValidation(result);
      setNotice(null);
    } catch {
      setNotice("Sem conexao. A atualizacao sera tentada novamente.");
    }
  }, [token]);

  useEffect(() => {
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const events = useMemo(() => {
    if (!validation.valid) return [];
    const today = saoPauloDay(new Date());
    return validation.events
      .map((event) => ({
        id: event.eventId,
        title: event.title,
        startsAt: event.startsAt,
      }))
      .sort((left, right) => {
        const leftToday = saoPauloDay(left.startsAt) === today;
        const rightToday = saoPauloDay(right.startsAt) === today;
        if (leftToday !== rightToday) return leftToday ? -1 : 1;
        return left.startsAt.localeCompare(right.startsAt);
      });
  }, [validation]);

  const columns = useMemo(() => {
    const initial: Record<KitchenStatus, KitchenOrder[]> = {
      pending: [],
      preparing: [],
      delivered: [],
    };
    if (!validation.valid) return initial;

    for (const order of validation.orders) {
      if (eventId !== "all" && order.eventId !== eventId) continue;
      initial[order.kitchenStatus].push(order);
    }
    initial.pending.sort((a, b) =>
      orderStatusTime(a).localeCompare(orderStatusTime(b)),
    );
    initial.preparing.sort((a, b) =>
      orderStatusTime(b).localeCompare(orderStatusTime(a)),
    );
    initial.delivered.sort((a, b) =>
      orderStatusTime(b).localeCompare(orderStatusTime(a)),
    );
    return initial;
  }, [eventId, validation]);

  async function startPreparation(redemptionId: string) {
    setWorkingId(redemptionId);
    setNotice(null);
    try {
      const response = await fetch("/api/kitchen/session/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, redemptionId }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        notificationSent?: boolean;
      };
      if (!response.ok || !result.ok) throw new Error("prepare_failed");
      setNotice(
        result.notificationSent
          ? "Pedido em preparo. Cliente avisado com a lista de itens."
          : "Pedido em preparo, mas o aviso nao foi enviado.",
      );
      await refresh();
    } catch {
      setNotice("Nao foi possivel colocar o pedido em preparo.");
    } finally {
      setWorkingId(null);
    }
  }

  if (!validation.valid) {
    return (
      <InformationPage
        eyebrow="Sistema cozinha"
        title="Acesso inválido"
        description="Solicite um novo link do Sistema Cozinha."
      />
    );
  }

  return (
    <main className="kitchen-shell">
      <header className="kitchen-header">
        <div>
          <p className="gate-kicker">Sistema Cozinha</p>
          <h1>Pedidos do bar</h1>
          <p>Atualizacao automatica a cada 5 segundos.</p>
        </div>
        <form className="kitchen-event-filter">
          <label htmlFor="kitchen-event">Escolha o evento</label>
          <select
            id="kitchen-event"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="all">Todos os eventos</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {saoPauloDay(event.startsAt) === saoPauloDay(new Date())
                  ? "HOJE - "
                  : ""}
                {event.title} - {formatEventDate(event.startsAt)}
              </option>
            ))}
          </select>
        </form>
        <span className="gate-status">Online</span>
      </header>

      {notice ? (
        <p className="kitchen-alert" role="status">
          {notice}
        </p>
      ) : null}

      <section className="kitchen-board">
        {(
          [
            ["pending", "Pedidos"],
            ["preparing", "Preparo / retirada"],
            ["delivered", "Entregues"],
          ] as const
        ).map(([status, title]) => (
          <section className={`kitchen-column is-${status}`} key={status}>
            <header>
              <h2>{title}</h2>
              <strong>{columns[status].length}</strong>
            </header>
            <div className="kitchen-column-cards">
              {columns[status].length ? (
                columns[status].map((order) => (
                  <OrderCard
                    key={order.redemptionId}
                    order={order}
                    working={workingId === order.redemptionId}
                    onPrepare={startPreparation}
                  />
                ))
              ) : (
                <p className="kitchen-column-empty">Nenhum pedido</p>
              )}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
