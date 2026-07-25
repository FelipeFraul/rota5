"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import BrandLogo from "@/app/BrandLogo";

const EMPTY_VALUE = "—";

type Tone = "neutral" | "ok" | "attention" | "danger" | "info";
type ActiveMetric = "revenue" | "tickets" | "combos" | "whatsapp" | "alerts";
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

type DetailItem = { label: string; value?: string; tone?: Tone };
type FeedItem = { time?: string; title: string; detail?: string; value?: string; tone?: Tone };
type ExpandedMetric = {
  title: string;
  icon: IconName;
  tone: Tone;
  headlineLabel: string;
  headlineDetail: string;
  showChart: boolean;
  summary: DetailItem[];
  sections: Array<{
    title: string;
    type?: "flow";
    items: FeedItem[];
  }>;
  insight: string;
};

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

const expandedMetricContent: Record<ActiveMetric, ExpandedMetric> = {
  revenue: {
    title: "Receita",
    icon: "cash",
    tone: "ok",
    headlineLabel: "Hoje",
    headlineDetail: "Comparativo",
    showChart: true,
    summary: [
      { label: "Receita total", tone: "ok" },
      { label: "Ingressos" },
      { label: "Combos", tone: "attention" },
      { label: "Repasse" },
    ],
    sections: [
      { title: "Evolução", items: [] },
      { title: "Últimas vendas", items: [{ title: "Nenhuma venda carregada." }] },
      {
        title: "Distribuição",
        items: [
          { title: "PIX" },
          { title: "Cartão" },
          { title: "Dinheiro" },
        ],
      },
    ],
    insight: "A IA ainda não recebeu fatos de receita para interpretar.",
  },
  tickets: {
    title: "Ingressos",
    icon: "ticket",
    tone: "info",
    headlineLabel: "Vendidos",
    headlineDetail: "Mini gráfico",
    showChart: true,
    summary: [
      { label: "Vendidos", tone: "ok" },
      { label: "Disponíveis" },
      { label: "Cortesias" },
      { label: "Cancelados", tone: "attention" },
      { label: "Check-ins", tone: "ok" },
    ],
    sections: [
      { title: "Evolução", items: [] },
      { title: "Últimos emitidos", items: [{ title: "Nenhum ingresso carregado." }] },
      { title: "Últimos check-ins", items: [{ title: "Nenhum check-in carregado." }] },
      {
        title: "Problemas",
        items: [
          { title: "QR recusados", tone: "danger" },
          { title: "QR duplicados", tone: "attention" },
          { title: "Ingressos cancelados", tone: "attention" },
        ],
      },
    ],
    insight: "A IA ainda não recebeu fatos de ingressos para interpretar.",
  },
  combos: {
    title: "Combos",
    icon: "bag",
    tone: "attention",
    headlineLabel: "Vendidos",
    headlineDetail: "Operação",
    showChart: true,
    summary: [
      { label: "Vendidos", tone: "ok" },
      { label: "Pagos", tone: "ok" },
      { label: "Utilizados" },
      { label: "Pendentes", tone: "attention" },
    ],
    sections: [
      { title: "Produtos mais vendidos", items: [{ title: "Nenhum produto carregado." }] },
      { title: "Últimos combos", items: [{ title: "Nenhum combo carregado." }] },
      {
        title: "Alertas",
        items: [
          { title: "Pagos sem QR", tone: "danger" },
          { title: "Aguardando utilização", tone: "attention" },
          { title: "Expirados", tone: "attention" },
        ],
      },
    ],
    insight: "A IA ainda não recebeu fatos de combos para interpretar.",
  },
  whatsapp: {
    title: "WhatsApp",
    icon: "message",
    tone: "info",
    headlineLabel: "Conversas",
    headlineDetail: "Mensagens",
    showChart: true,
    summary: [
      { label: "Conversas", tone: "ok" },
      { label: "Compradores" },
      { label: "Mensagens" },
      { label: "Tempo médio" },
    ],
    sections: [
      {
        title: "Fluxo",
        type: "flow",
        items: [
          { title: "Entraram" },
          { title: "Abriram evento" },
          { title: "Selecionaram ingresso" },
          { title: "Pagaram" },
        ],
      },
      { title: "Últimas conversas", items: [{ title: "Nenhuma conversa carregada." }] },
      {
        title: "Abandonos",
        items: [
          { title: "Pagamento iniciado", tone: "attention" },
          { title: "Sem resposta", tone: "attention" },
        ],
      },
    ],
    insight: "A IA ainda não recebeu fatos de WhatsApp para interpretar.",
  },
  alerts: {
    title: "Alertas",
    icon: "alert",
    tone: "danger",
    headlineLabel: "Ativos",
    headlineDetail: "Prioridade",
    showChart: false,
    summary: [
      { label: "Críticos", tone: "danger" },
      { label: "Atenção", tone: "attention" },
      { label: "Informação" },
      { label: "Última atualização" },
    ],
    sections: [
      {
        title: "Crítico",
        items: [
          { title: "Pagamento aprovado sem ingresso", tone: "danger" },
          { title: "Combo pago sem QR", tone: "danger" },
        ],
      },
      {
        title: "Atenção",
        items: [
          { title: "Participantes sem telefone", tone: "attention" },
          { title: "QR pendentes", tone: "attention" },
          { title: "Mensagens retry", tone: "attention" },
        ],
      },
      { title: "Informação", items: [{ title: "Evento começa em breve" }] },
      { title: "Últimos alertas", items: [{ title: "Nenhum alerta carregado." }] },
    ],
    insight: "A IA ainda não recebeu fatos de alertas para interpretar.",
  },
};

function MetricPill({
  metric,
  isActive,
  onClick,
}: {
  metric: ActiveMetric;
  isActive: boolean;
  onClick: () => void;
}) {
  const config = expandedMetricContent[metric];
  const className = `admin-operation-metric is-${config.tone}${isActive ? " is-active" : ""}`;

  return (
    <button type="button" className={className} onClick={onClick} aria-pressed={isActive}>
      <div className="admin-operation-metric-copy">
        <span>
          <OperationIcon name={config.icon} />
          {config.title}
        </span>
        <strong>{EMPTY_VALUE}</strong>
        <small>{config.headlineLabel}</small>
      </div>
      {config.showChart ? (
        <svg className="admin-operation-metric-chart" viewBox="0 0 148 76" aria-hidden="true" focusable="false">
          <path d="M4 54c16-12 28 2 44-8 15-9 20-28 40-20 18 7 27 5 56-11" />
          <path d="M4 34c14 9 27 10 42 3 18-9 27-2 42 7 19 11 32-3 56-1" />
          <path d="M4 62c18-3 30-14 46-13 17 2 27 12 42 10 20-3 31-18 52-23" />
        </svg>
      ) : (
        <span className="admin-operation-alert-badge">{EMPTY_VALUE}</span>
      )}
    </button>
  );
}

function ExpandedPanel({ metric }: { metric: ExpandedMetric }) {
  return (
    <section className={`admin-operation-block admin-operation-expanded is-${metric.tone}`}>
      <header className="admin-operation-block-heading">
        <OperationIcon name={metric.icon} />
        <h2>{metric.title}</h2>
      </header>
      <div className="admin-operation-expanded-toolbar">
        <label>
          <span>Dias para comparativo</span>
          <input type="number" min="1" max="365" defaultValue="30" inputMode="numeric" />
        </label>
      </div>
      <div className="admin-operation-expanded-summary">
        {metric.summary.map((item) => (
          <StatusRow key={item.label} label={item.label} tone={item.tone} />
        ))}
      </div>
      {metric.showChart ? (
        <div className="admin-operation-main-chart" aria-label="Gráfico visual aguardando dados">
          <svg viewBox="0 0 620 180" aria-hidden="true" focusable="false">
            <path d="M10 130c55-42 95 6 150-26 52-31 71-86 137-59 59 24 88 18 180-35 48-28 82 7 133 0" />
            <path d="M10 88c48 31 92 33 144 8 61-30 92-7 144 22 63 35 106-11 312-2" />
            <path d="M10 152c61-11 101-48 157-41 58 7 92 42 144 33 69-12 106-62 299-76" />
          </svg>
        </div>
      ) : null}
      <div className="admin-operation-expanded-columns">
        {metric.sections.map((section) => (
          <div key={section.title} className={`admin-operation-sublist${section.type === "flow" ? " is-flow" : ""}`}>
            <h3>{section.title}</h3>
            {section.items.map((item) => (
              <article key={item.title} className={`admin-operation-feed-row is-${item.tone ?? "neutral"}`}>
                <time>{item.time ?? EMPTY_VALUE}</time>
                <span>{item.title}</span>
                {item.detail ? <small>{item.detail}</small> : null}
                <strong>{item.value ?? EMPTY_VALUE}</strong>
              </article>
            ))}
          </div>
        ))}
      </div>
      <div className="admin-operation-insight">
        <h3>IA</h3>
        <p>{metric.insight}</p>
      </div>
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

export default function OperationalDashboardSection() {
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>("revenue");
  const expandedMetric = expandedMetricContent[activeMetric];

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
        <section className="admin-operation-metrics" aria-label="Resumo compacto">
          {(Object.keys(expandedMetricContent) as ActiveMetric[]).map((metric) => (
            <MetricPill
              key={metric}
              metric={metric}
              isActive={activeMetric === metric}
              onClick={() => setActiveMetric(metric)}
            />
          ))}
        </section>

        <ExpandedPanel metric={expandedMetric} />
      </main>
    </>
  );
}
