import Link from "next/link";
import BrandLogo from "@/app/BrandLogo";

const EMPTY_VALUE = "\u2014";

function SummaryCard({
  label,
  description,
  tone = "neutral",
}: {
  label: string;
  description: string;
  tone?: "neutral" | "ok" | "attention" | "danger";
}) {
  return (
    <article className={`admin-operation-summary-card is-${tone}`}>
      <span>{label}</span>
      <strong>{EMPTY_VALUE}</strong>
      <small>{description}</small>
    </article>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="admin-dashboard-section-heading">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "ok" | "attention" | "danger";
}) {
  return (
    <article className={`admin-operation-status-row is-${tone}`}>
      <span>{label}</span>
      <strong>{EMPTY_VALUE}</strong>
    </article>
  );
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
        <section className="admin-operation-summary" aria-label="Resumo geral operacional">
          <SummaryCard label="Eventos" description="Situação operacional dos eventos." tone="ok" />
          <SummaryCard label="Check-ins" description="Entradas e recusas em tempo real." tone="ok" />
          <SummaryCard label="Ingressos" description="Emissão, uso e entrega aos participantes." />
          <SummaryCard label="Combos" description="Pedidos, pagamentos e QR operacionais." tone="attention" />
          <SummaryCard label="Alertas" description="Falhas e inconsistências detectáveis." tone="danger" />
        </section>

        <div className="admin-operation-grid">
          <section className="admin-dashboard-card">
            <SectionHeading title="Fluxo por portaria" description="Distribuição das entradas por ponto de acesso." />
            <div className="admin-operation-table" role="table" aria-label="Fluxo por portaria">
              <div role="row" className="admin-operation-table-head">
                <span role="columnheader">Portaria</span>
                <span role="columnheader">Entradas</span>
                <span role="columnheader">Últimos 15 minutos</span>
                <span role="columnheader">Recusas</span>
              </div>
              <p className="admin-dashboard-empty">Nenhum dado de portaria carregado.</p>
            </div>
          </section>

          <section className="admin-dashboard-card">
            <SectionHeading title="Eventos e sessões" description="Eventos em andamento e próximos eventos." />
            <div className="admin-operation-event-columns">
              <div>
                <h4>Em andamento</h4>
                <p className="admin-dashboard-empty">Nenhum evento operacional carregado.</p>
              </div>
              <div>
                <h4>Próximos eventos</h4>
                <p className="admin-dashboard-empty">Nenhum evento operacional carregado.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="admin-operation-grid">
          <section className="admin-dashboard-card">
            <SectionHeading title="Filas operacionais" description="Estados de processamento que exigem acompanhamento." />
            <div className="admin-operation-status-list">
              <StatusRow label="Envios pendentes" tone="attention" />
              <StatusRow label="Envios em processamento" />
              <StatusRow label="Mensagens em retry" tone="attention" />
              <StatusRow label="Jobs presos" tone="danger" />
            </div>
          </section>

          <section className="admin-dashboard-card">
            <SectionHeading title="Falhas e inconsistências" description="Pontos que podem exigir ação operacional." />
            <div className="admin-operation-status-list">
              <StatusRow label="Falhas de envio" tone="danger" />
              <StatusRow label="Pagamentos não processados" tone="attention" />
              <StatusRow label="Pedidos pagos sem ingresso" tone="danger" />
              <StatusRow label="Combos pagos sem QR" tone="danger" />
            </div>
          </section>
        </div>

        <div className="admin-operation-grid">
          <section className="admin-dashboard-card">
            <SectionHeading title="Ingressos e participantes" description="Status objetivo de emissão, uso e entrega de QR." />
            <div className="admin-operation-status-list">
              <StatusRow label="Ingressos emitidos" />
              <StatusRow label="Ingressos utilizados" />
              <StatusRow label="QR de participantes entregues" />
              <StatusRow label="QR de participantes pendentes" tone="attention" />
            </div>
          </section>

          <section className="admin-dashboard-card">
            <SectionHeading title="Combos" description="Pedidos, pagamentos e utilização de combos." />
            <div className="admin-operation-status-list">
              <StatusRow label="Aguardando pagamento" tone="attention" />
              <StatusRow label="Pagos" />
              <StatusRow label="Utilizados" />
              <StatusRow label="Pagos sem QR disponível" tone="danger" />
            </div>
          </section>
        </div>

        <section className="admin-dashboard-card">
          <SectionHeading title="Alertas operacionais" description="Espaço reservado para inconsistências e falhas futuras." />
          <p className="admin-dashboard-empty">Nenhum dado de alerta carregado.</p>
        </section>
      </section>
    </>
  );
}
