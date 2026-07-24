"use client";

import { useEffect, useState, type MouseEvent } from "react";
import type { ContactActivityContact, EventDashboard } from "../AdminEventsEditor";
import { formatInteger } from "../dashboard/dashboardUtils";

function closeOnOverlayClick(event: MouseEvent<HTMLDivElement>, onClose: () => void) {
  if (event.target === event.currentTarget) onClose();
}

function formatContactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${digits}`;
}

function formatContactDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function ConversationModal({
  contact,
  onClose,
}: {
  contact: ContactActivityContact;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const messages = contact.conversationMessages.length
    ? contact.conversationMessages
    : null;

  function getMessageLabel(
    message: ContactActivityContact["conversationMessages"][number],
  ) {
    if (message.direction === "inbound") return "Cliente";
    if (message.outboundStatus === "sent") return "Sistema · aceito pela Z-API";
    if (message.outboundStatus === "failed") {
      return "Falha no envio · cliente pode não ter recebido";
    }
    return "Sistema · status desconhecido";
  }

  function getMessageStyle(
    message: ContactActivityContact["conversationMessages"][number],
  ) {
    return message.direction === "outbound" && message.outboundStatus === "failed"
      ? {
          borderColor: "#dc2626",
          background: "#fef2f2",
          color: "#7f1d1d",
        }
      : undefined;
  }

  return (
    <div
      className="admin-event-modal admin-conversation-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${contact.name?.trim() || "contato"}`}
      onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
    >
      <section className="admin-conversation-panel">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-events-kicker">WhatsApp</p>
            <h2>{contact.name?.trim() || "Nome não informado"}</h2>
            <span>{formatContactPhone(contact.phone)} · {formatInteger(contact.messageCount)} {contact.messageCount === 1 ? "mensagem" : "mensagens"}</span>
          </div>
          <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar conversa">&times;</button>
        </header>
        <div className="admin-conversation-content">
          {messages ? messages.map((message, index) => (
            <span
              key={`${message.createdAt}-${index}`}
              className={`admin-contact-message-bubble ${message.direction === "outbound" ? "is-system" : "is-client"}`}
              style={getMessageStyle(message)}
            >
              <b>{getMessageLabel(message)} · {formatContactDateTime(message.createdAt)}</b>
              {message.body}
            </span>
          )) : (
            <>
              <span className="admin-contact-message-bubble is-client">
                <b>Cliente</b>
                {contact.lastInboundMessage ?? "Sem mensagem recebida registrada."}
              </span>
              <span className="admin-contact-message-bubble is-system">
                <b>Sistema</b>
                {contact.lastOutboundMessage ?? "Sem resposta do sistema registrada."}
              </span>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function ContactsModal({
  activity,
  title,
  onClose,
}: {
  activity: EventDashboard["contactActivity"];
  title: string;
  onClose: () => void;
}) {
  const [conversationContact, setConversationContact] = useState<ContactActivityContact | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (conversationContact) {
          setConversationContact(null);
          return;
        }

        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [conversationContact, onClose]);

  return (
    <div
      className="admin-event-modal admin-contacts-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => closeOnOverlayClick(event, onClose)}
    >
      <section className="admin-contacts-panel">
        <header className="admin-dashboard-header">
          <div>
            <p className="admin-events-kicker">WhatsApp</p>
            <h2>{title}</h2>
            <span>{formatInteger(activity.totalUniqueContacts)} pessoas únicas · {activity.periodLabel}</span>
          </div>
          <button type="button" className="admin-event-icon-button" onClick={onClose} aria-label="Fechar contatos">&times;</button>
        </header>
        <div className="admin-contacts-list">
          {activity.contacts.length ? activity.contacts.map((contact) => (
            <article key={contact.customerId}>
              <div className="admin-contact-identity">
                <strong>{contact.name?.trim() || "Nome não informado"}</strong>
                <a href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{formatContactPhone(contact.phone)}</a>
              </div>
              <div className="admin-contact-details">
                <div className="admin-contact-facts">
                  <span>{formatInteger(contact.messageCount)} {contact.messageCount === 1 ? "mensagem" : "mensagens"}</span>
                  <span><b>Comprou ingresso:</b> {contact.purchasedTicket ? "Sim" : "Não"}</span>
                  <span><b>Último contato:</b> {formatContactDateTime(contact.lastContactAt)}</span>
                </div>
                <div className="admin-contact-stop">
                  <span><b>Parou em:</b> {contact.stoppedAtLabel}</span>
                  <button
                    type="button"
                    className="admin-contact-message-link"
                    onClick={() => setConversationContact(contact)}
                  >
                    Ver conversa
                  </button>
                </div>
                {contact.purchasedEvents.length ? (
                  <div className="admin-contact-purchases">
                    {contact.purchasedEvents.map((event) => (
                      <span key={event.sessionId}>
                        <b>Evento:</b> {event.name} · {formatContactDateTime(event.startsAt)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          )) : <p className="admin-dashboard-empty">Nenhum contato recebido no período.</p>}
        </div>
      </section>
      {conversationContact ? (
        <ConversationModal
          contact={conversationContact}
          onClose={() => setConversationContact(null)}
        />
      ) : null}
    </div>
  );
}
