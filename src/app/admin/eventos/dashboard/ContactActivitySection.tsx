"use client";

import { useState } from "react";
import type { EventDashboard } from "../AdminEventsEditor";
import {
  SIX_HOUR_BOUNDARIES,
  buildSmoothLinePath,
  formatHour,
  formatInteger,
} from "./dashboardUtils";

function ContactActivityChart({ activity }: { activity: EventDashboard["contactActivity"] }) {
  const [hover, setHover] = useState<(typeof activity.points)[number] | null>(null);
  const rows = activity.points;
  const width = 960;
  const height = 130;
  const padding = { top: 14, right: 28, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.uniqueContacts, row.messagesReceived]));
  const xForIndex = (index: number) => padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const xForHour = (hour: number) => padding.left + (hour / 24) * chartWidth;
  const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const points = rows.map((row, index) => ({
    ...row,
    x: activity.range === "day" && row.positionHour !== undefined ? xForHour(row.positionHour) : xForIndex(index),
    uniqueY: yForValue(row.uniqueContacts),
    messagesY: yForValue(row.messagesReceived),
  }));
  const uniquePath = buildSmoothLinePath(points.map((point) => ({ x: point.x, y: point.uniqueY })));
  const messagesPath = buildSmoothLinePath(points.map((point) => ({ x: point.x, y: point.messagesY })));
  const activePoint = hover ? points.find((point) => point.key === hover.key) : null;

  return (
    <div className="admin-contact-chart" onMouseLeave={() => setHover(null)}>
      <div className="admin-dashboard-line-legend">
        <span><i style={{ background: "#7c3aed" }} />Pessoas únicas</span>
        <span><i style={{ background: "#0f766e" }} />Mensagens recebidas</span>
      </div>
      <div className="admin-dashboard-chart-plot">
        {hover && activePoint ? (
          <div
            className="admin-dashboard-line-tooltip"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(Math.min(activePoint.uniqueY, activePoint.messagesY) / height) * 100}%`,
              borderColor: "#7c3aed",
            }}
          >
            <span>{hover.intervalLabel ?? hover.label}</span>
            <strong style={{ color: "#7c3aed" }}>
              {formatInteger(hover.uniqueContacts)} {hover.uniqueContacts === 1 ? "pessoa única" : "pessoas únicas"}
            </strong>
            <em>{formatInteger(hover.messagesReceived)} {hover.messagesReceived === 1 ? "mensagem recebida" : "mensagens recebidas"}</em>
          </div>
        ) : null}
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Pessoas que enviaram mensagem ao WhatsApp em ${activity.periodLabel.toLowerCase()}, em intervalos de seis horas`}>
          {[maxValue, 0].map((tick) => (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={yForValue(tick)} y2={yForValue(tick)} className="admin-dashboard-grid-line" />
              <text x={padding.left - 14} y={yForValue(tick) + 4} textAnchor="end" className="admin-dashboard-axis-label">{tick}</text>
            </g>
          ))}
          <path d={uniquePath} className="admin-dashboard-section-line" style={{ stroke: "#7c3aed" }} />
          <path d={messagesPath} className="admin-dashboard-section-line" style={{ stroke: "#0f766e" }} />
          {points.map((point) => (
            <circle
              key={`hit-${point.key}`}
              cx={point.x}
              cy={Math.min(point.uniqueY, point.messagesY)}
              r="9"
              className="admin-dashboard-line-hit"
              onMouseEnter={() => setHover(activity.points.find((row) => row.key === point.key) ?? null)}
            />
          ))}
          {points.map((point) => (
            <circle key={`unique-${point.key}`} cx={point.x} cy={point.uniqueY} r="5" className="admin-dashboard-line-point" style={{ fill: "#7c3aed", pointerEvents: "none" }} />
          ))}
          {points.map((point) => (
            <circle key={`messages-${point.key}`} cx={point.x} cy={point.messagesY} r="5" className="admin-dashboard-line-point" style={{ fill: "#0f766e", pointerEvents: "none" }} />
          ))}
          {activity.range === "day"
            ? SIX_HOUR_BOUNDARIES.map((hour) => (
                <text key={`label-${hour}`} x={xForHour(hour)} y={height - 12} textAnchor="middle" className="admin-dashboard-axis-label">{formatHour(hour)}</text>
              ))
            : points.map((point, index) => index % Math.max(1, Math.ceil(points.length / 9)) === 0 || index === points.length - 1 ? (
                <text key={`label-${point.key}`} x={point.x} y={height - 12} textAnchor="middle" className="admin-dashboard-axis-label">{point.label}</text>
              ) : null)}
        </svg>
      </div>
    </div>
  );
}

export default function ContactActivitySection({
  activity,
  eventSpecific = false,
  loading = false,
  onOpen,
}: {
  activity: EventDashboard["contactActivity"];
  eventSpecific?: boolean;
  loading?: boolean;
  onOpen: () => void;
}) {
  return (
    <section className="admin-dashboard-chart-card">
      <div className="admin-dashboard-section-heading">
        <div>
          <h3>Contatos no WhatsApp</h3>
          <p>{eventSpecific
            ? "Pessoas que conversaram na jornada deste show e concluíram a compra, em intervalos de 6 horas."
            : `Todas as pessoas que mandaram mensagem em ${activity.periodLabel.toLowerCase()}, em intervalos de 6 horas.`}</p>
        </div>
        <button type="button" className="admin-dashboard-contact-button" onClick={onOpen}>Ver contatos</button>
      </div>
      <div className="admin-contact-summary">
        <span><strong>{formatInteger(activity.totalUniqueContacts)}</strong> pessoas · {activity.periodLabel}</span>
        <span><strong>{formatInteger(activity.totalMessages)}</strong> mensagens recebidas</span>
        <span><strong>{activity.peakLabel
          ? `${activity.peakLabel} (${formatInteger(activity.peakUniqueContacts)})`
          : "—"}</strong> maior incidência</span>
      </div>
      {loading
        ? <p className="admin-dashboard-empty">Atualizando contatos...</p>
        : <ContactActivityChart activity={activity} />}
    </section>
  );
}
