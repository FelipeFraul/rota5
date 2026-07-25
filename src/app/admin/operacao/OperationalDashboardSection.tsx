import Link from "next/link";
import type { ReactNode } from "react";
import BrandLogo from "@/app/BrandLogo";

const EMPTY_VALUE = "—";

type Tone = "neutral" | "ok" | "attention" | "danger" | "info";
type IconName =
  | "activity"
  | "ticket"
  | "door"
  | "alert"
  | "message"
  | "bag"
  | "refresh"
  | "calendar"
  | "users"
  | "cash"
  | "spark";

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
    users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
    cash: <path d="M3 7h18v10H3V7Zm3 3h.01M18 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    spark: <path d="m12 3 1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3Zm6 12 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />,
  };

  return (
    <svg className="admin-operation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function MetricPill({ label, icon, tone = "neutral" }: { label: string; icon: IconName; tone?: Tone }) {
  return (
    <article className={`admin-operation-metric is-${tone}`}>
      <div className="admin-operation-metric-copy">
        <span>
          <OperationIcon name={icon} />
          {label}
        </span>
        <strong>{EMPTY_VALUE}</strong>
        <small>Aguardando dados</small>
      </div>
      <svg className="admin-operation-metric-chart" viewBox="0 0 148 76" aria-hidden="true" focusable="false">
        <path d="M4 54c16-12 28 2 44-8 15-9 20-28 40-20 18 7 27 5 56-11" />
        <path d="M4 34c14 9 27 10 42 3 18-9 27-2 42 7 19 11 32-3 56-1" />
        <path d="M4 62c18-3 30-14 46-13 17 2 27 12 42 10 20-3 31-18 52-23" />
      </svg>
    </article>
  );
}

function Section({
  title,
  icon,
  tone = "neutral",
  children,
}: {
  title: string;
  icon: IconName;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section className={`admin-operation-block is-${tone}`}>
      <header className="admin-operation-block-heading">
        <OperationIcon name={icon} />
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function StatusRow({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <article className={`admin-operation-row is-${tone}`}>
      <span>{label}</span>
      <strong>{EMPTY_VALUE}</strong>
    </article>
  );
}

function TimelineEmpty({ label }: { label: string }) {
  return (
    <article className="admin-operation-timeline-empty">
      <time>{EMPTY_VALUE}</time>
      <span>{label}</span>
    </article>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="admin-operation-empty">{children}</p>;
}

export default function OperationalDashboardSection() {
  return (
    <>
      <header className="admin-operation-hero">
        <BrandLogo />
        <div className="admin-operation-title">
          <p className="admin-events-kicker">Admin</p>
          <h1>Operação ao vivo</h1>
          <p>
            <span className="admin-operation-live-dot" />
            Operação não conectada
          </p>
        </div>
        <div className="admin-operation-top-actions">
          <span>Atualizado: {EMPTY_VALUE}</span>
          <Link className="admin-operation-link" href="/admin/eventos">
            Editar eventos
          </Link>
        </div>
        <div className="admin-operation-controls" aria-label="Controles da operação ao vivo">
          <label>
            <span>Evento</span>
            <select disabled defaultValue="">
              <option value="">Nenhum evento carregado</option>
            </select>
          </label>
          <button type="button">
            <OperationIcon name="refresh" />
            Atualizar
          </button>
        </div>
      </header>

      <main className="admin-operation-layout" aria-label="Centro de inteligência operacional">
        <section className="admin-operation-health is-ok" aria-label="Agora">
          <div>
            <span className="admin-operation-live-dot" />
            <div>
              <p>Agora</p>
              <strong>Operação normal</strong>
            </div>
          </div>
          <div className="admin-operation-alert-strip is-temporarily-hidden" aria-label="Alertas aguardando dados">
            <StatusRow label="Pagamentos presos" tone="attention" />
            <StatusRow label="Mensagens falhando" tone="danger" />
            <StatusRow label="QR recusados" tone="danger" />
            <StatusRow label="Combos sem QR" tone="attention" />
            <StatusRow label="Participantes pendentes" tone="attention" />
          </div>
        </section>

        <section className="admin-operation-metrics" aria-label="Resumo compacto">
          <MetricPill label="Receita" icon="cash" tone="ok" />
          <MetricPill label="Ingressos" icon="ticket" />
          <MetricPill label="Combos" icon="bag" tone="attention" />
          <MetricPill label="Conversão" icon="activity" tone="info" />
          <MetricPill label="Alertas" icon="alert" tone="danger" />
        </section>

        <section className="admin-operation-focus-grid is-single">
          <Section title="Vendas" icon="cash" tone="ok">
            <div className="admin-operation-mini-grid">
              <StatusRow label="Receita" tone="ok" />
              <StatusRow label="Ingressos" />
              <StatusRow label="Combos" tone="attention" />
              <StatusRow label="Conversão" tone="info" />
            </div>
            <div className="admin-operation-sublist">
              <h3>Últimas vendas</h3>
              <EmptyLine>Nenhuma venda carregada.</EmptyLine>
            </div>
          </Section>
        </section>

        <section className="admin-operation-focus-grid">
          <Section title="Entradas" icon="door" tone="ok">
            <div className="admin-operation-row-list">
              <StatusRow label="Entradas realizadas" tone="ok" />
              <StatusRow label="Últimos check-ins" tone="ok" />
              <StatusRow label="Recusas" tone="danger" />
              <StatusRow label="Duplicados" tone="attention" />
            </div>
            <div className="admin-operation-sublist">
              <h3>Últimas entradas</h3>
              <EmptyLine>Nenhum check-in carregado.</EmptyLine>
            </div>
          </Section>

          <Section title="Participantes" icon="users" tone="info">
            <div className="admin-operation-row-list">
              <StatusRow label="Enviados" tone="ok" />
              <StatusRow label="Entregues" tone="ok" />
              <StatusRow label="Aguardando telefone" tone="attention" />
              <StatusRow label="Aguardando resposta" tone="attention" />
            </div>
            <div className="admin-operation-sublist">
              <h3>Participantes pendentes</h3>
              <EmptyLine>Nenhum participante carregado.</EmptyLine>
            </div>
          </Section>
        </section>

        <section className="admin-operation-focus-grid is-secondary">
          <Section title="Combos" icon="bag" tone="attention">
            <div className="admin-operation-row-list">
              <StatusRow label="Pagos" tone="ok" />
              <StatusRow label="Utilizados" tone="ok" />
              <StatusRow label="Pendentes" tone="attention" />
              <StatusRow label="Sem QR" tone="danger" />
            </div>
            <div className="admin-operation-sublist">
              <h3>Últimos combos</h3>
              <EmptyLine>Nenhum combo carregado.</EmptyLine>
            </div>
          </Section>

          <Section title="Eventos" icon="calendar" tone="info">
            <div className="admin-operation-event-groups">
              <div>
                <h3>Eventos ativos</h3>
                <EmptyLine>Nenhum evento operacional carregado.</EmptyLine>
              </div>
              <div>
                <h3>Próximos eventos</h3>
                <EmptyLine>Nenhum próximo evento carregado.</EmptyLine>
              </div>
              <div>
                <h3>Sessões, mesas e bistrôs</h3>
                <EmptyLine>Nenhuma configuração operacional carregada.</EmptyLine>
              </div>
            </div>
          </Section>
        </section>

        <section className="admin-operation-focus-grid is-secondary">
          <Section title="Administração" icon="message">
            <div className="admin-operation-timeline">
              <TimelineEmpty label="Nenhuma ação administrativa carregada." />
            </div>
          </Section>

          <Section title="IA" icon="spark" tone="info">
            <div className="admin-operation-insight">
              <p>A IA ainda não recebeu fatos operacionais para interpretar.</p>
            </div>
          </Section>
        </section>
      </main>
    </>
  );
}
