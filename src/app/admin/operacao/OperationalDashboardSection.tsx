import Link from "next/link";
import type { ReactNode } from "react";
import BrandLogo from "@/app/BrandLogo";

const EMPTY_VALUE = "\u2014";

type Tone = "neutral" | "ok" | "attention" | "danger";
type IconName = "activity" | "ticket" | "door" | "alert" | "message" | "bag" | "refresh" | "calendar";

function OperationIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    activity: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    ticket: <path d="M4 8a2 2 0 0 1 2-2h12v4a2 2 0 0 0 0 4v4H6a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4Z" />,
    door: <path d="M6 21V5a2 2 0 0 1 2-2h9v18M10 12h.01" />,
    alert: <path d="M12 3 2.8 19h18.4L12 3Zm0 6v4m0 4h.01" />,
    message: <path d="M21 12a8 8 0 0 1-8 8H5l-3 3v-8a8 8 0 1 1 19-3Z" />,
    bag: <path d="M6 8h12l-1 13H7L6 8Zm3 0a3 3 0 0 1 6 0" />,
    refresh: <path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.6 6.6M5.5 15a7 7 0 0 0 11.9 2.4" />,
    calendar: <path d="M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />,
  };

  return (
    <svg className="admin-operation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function SummaryItem({
  label,
  icon,
  tone = "neutral",
}: {
  label: string;
  icon: IconName;
  tone?: Tone;
}) {
  return (
    <article className={`admin-operation-summary-item is-${tone}`}>
      <OperationIcon name={icon} />
      <div>
        <span>{label}</span>
        <strong>{EMPTY_VALUE}</strong>
      </div>
    </article>
  );
}

function SectionHeading({ title, icon }: { title: string; icon: IconName }) {
  return (
    <div className="admin-operation-section-heading">
      <OperationIcon name={icon} />
      <h2>{title}</h2>
    </div>
  );
}

function StatusRow({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <article className={`admin-operation-row is-${tone}`}>
      <span>{label}</span>
      <strong>{EMPTY_VALUE}</strong>
    </article>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="admin-operation-empty">{children}</p>;
}

export default function OperationalDashboardSection() {
  return (
    <>
      <header className="admin-events-header admin-operation-header">
        <BrandLogo />
        <div>
          <p className="admin-events-kicker">Admin</p>
          <h1>Operação ao vivo</h1>
          <p>Acompanhamento operacional dos eventos em tempo real</p>
        </div>
        <Link className="admin-operation-link" href="/admin/eventos">
          Editar eventos
        </Link>
      </header>

      <section className="admin-operation-toolbar" aria-label="Controles da operação ao vivo">
        <label>
          <span>Evento</span>
          <select disabled defaultValue="">
            <option value="">Nenhum evento carregado</option>
          </select>
        </label>
        <button type="button">Atualizar</button>
        <p>Aguardando dados</p>
        <strong>Painel ainda não conectado</strong>
      </section>

      <section className="admin-operation-layout" aria-label="Painel operacional">
        <section className="admin-operation-status-strip is-neutral" aria-label="Status operacional">
          <div>
            <span className="admin-operation-status-dot" />
            <strong>Operação não conectada</strong>
          </div>
          <p>Aguardando dados</p>
        </section>

        <section className="admin-operation-summary" aria-label="Resumo geral operacional">
          <SummaryItem label="Eventos" icon="calendar" tone="ok" />
          <SummaryItem label="Check-ins" icon="door" tone="ok" />
          <SummaryItem label="Ingressos" icon="ticket" />
          <SummaryItem label="Combos" icon="bag" tone="attention" />
          <SummaryItem label="Filas" icon="message" tone="attention" />
          <SummaryItem label="Alertas" icon="alert" tone="danger" />
        </section>

        <section className="admin-operation-surface">
          <SectionHeading title="Eventos e sessões" icon="calendar" />
          <div className="admin-operation-split">
            <div className="admin-operation-group">
              <h3>Em andamento</h3>
              <EmptyLine>Nenhum evento operacional carregado.</EmptyLine>
            </div>
            <div className="admin-operation-group">
              <h3>Próximos eventos</h3>
              <EmptyLine>Nenhum evento operacional carregado.</EmptyLine>
            </div>
          </div>
        </section>

        <div className="admin-operation-grid">
          <section className="admin-operation-surface">
            <SectionHeading title="Check-in e portarias" icon="door" />
            <div className="admin-operation-portaria-list" aria-label="Fluxo por portaria">
              <div className="admin-operation-portaria-head">
                <span>Portaria</span>
                <span>Entradas</span>
                <span>Últimos 15 minutos</span>
                <span>Recusas</span>
              </div>
              <EmptyLine>Nenhum dado de portaria carregado.</EmptyLine>
            </div>
          </section>

          <section className="admin-operation-surface">
            <SectionHeading title="Filas operacionais" icon="message" />
            <div className="admin-operation-row-list">
              <StatusRow label="Envios pendentes" tone="attention" />
              <StatusRow label="Envios em processamento" />
              <StatusRow label="Mensagens em retry" tone="attention" />
              <StatusRow label="Jobs presos" tone="danger" />
            </div>
          </section>
        </div>

        <div className="admin-operation-grid">
          <section className="admin-operation-surface">
            <SectionHeading title="Combos" icon="bag" />
            <div className="admin-operation-row-list">
              <StatusRow label="Aguardando pagamento" tone="attention" />
              <StatusRow label="Pagos" />
              <StatusRow label="Utilizados" />
              <StatusRow label="Pagos sem QR disponível" tone="danger" />
            </div>
          </section>

          <section className="admin-operation-surface">
            <SectionHeading title="Detalhes técnicos" icon="ticket" />
            <div className="admin-operation-row-list">
              <StatusRow label="Ingressos emitidos" />
              <StatusRow label="Ingressos utilizados" />
              <StatusRow label="QR de participantes entregues" />
              <StatusRow label="QR de participantes pendentes" tone="attention" />
            </div>
          </section>
        </div>

        <section className="admin-operation-surface">
          <SectionHeading title="Falhas e inconsistências" icon="alert" />
          <div className="admin-operation-row-list">
            <StatusRow label="Falhas de envio" tone="danger" />
            <StatusRow label="Pagamentos não processados" tone="attention" />
            <StatusRow label="Pedidos pagos sem ingresso" tone="danger" />
            <StatusRow label="Combos pagos sem QR" tone="danger" />
          </div>
        </section>

        <section className="admin-operation-surface">
          <SectionHeading title="Alertas operacionais" icon="activity" />
          <EmptyLine>Nenhum dado de alerta carregado.</EmptyLine>
        </section>
      </section>
    </>
  );
}
