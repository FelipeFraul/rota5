"use client";

import { useState } from "react";
import type { EventDashboard, GeneralDashboardPeriod } from "../AdminEventsEditor";
import {
  SIX_HOUR_BOUNDARIES,
  buildDailyLineData,
  buildSmoothLinePath,
  formatCurrency,
  formatHour,
  formatInteger,
  getSixHourIntervalLabelFromStart,
} from "./dashboardUtils";

type ChartHover = {
  x: number;
  y: number;
  label: string;
  name: string;
  value: number;
  revenueCents: number;
  color: string;
};

export function DailyLineChart({ data }: { data: EventDashboard }) {
  const [hover, setHover] = useState<ChartHover | null>(null);
  const rows = buildDailyLineData(data);
  const width = 960;
  const height = 150;
  const padding = { top: 16, right: 28, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...rows.map((row) => row.total), ...rows.map((row) => row.courtesy));
  const yTicks = [maxValue, Math.round(maxValue * 0.5), 0].filter((value, index, values) => values.indexOf(value) === index);
  const xForIndex = (index: number) => padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const xForHour = (hour: number) => padding.left + (hour / 24) * chartWidth;
  const xForRow = (row: (typeof rows)[number], index: number) => data.range === "day"
    ? xForHour(Number(row.label.replace("h", "")) + 3)
    : xForIndex(index);
  const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const totalPoints = rows.map((row, index) => ({
    x: xForRow(row, index),
    y: yForValue(row.total),
    value: row.total,
    revenueCents: row.revenueCents,
    label: data.range === "day" ? getSixHourIntervalLabelFromStart(Number(row.label.replace("h", ""))) : row.label,
  }));
  const courtesyPoints = rows.map((row, index) => ({
    x: xForRow(row, index),
    y: yForValue(row.courtesy),
    value: row.courtesy,
    revenueCents: 0,
    label: data.range === "day" ? getSixHourIntervalLabelFromStart(Number(row.label.replace("h", ""))) : row.label,
  }));
  const totalPath = buildSmoothLinePath(totalPoints);
  const courtesyPath = buildSmoothLinePath(courtesyPoints);
  const labelStep = Math.max(1, Math.ceil(rows.length / 9));

  return (
    <div className="admin-dashboard-line-chart" onMouseLeave={() => setHover(null)}>
      <div className="admin-dashboard-line-legend">
        <span><i style={{ background: "#16a34a" }} />Compras</span>
        <span><i style={{ background: "#3b82f6" }} />Cortesias</span>
      </div>
      <div className="admin-dashboard-chart-plot">
        {hover ? (
          <div
            className="admin-dashboard-line-tooltip"
            style={{
              left: `${(hover.x / width) * 100}%`,
              top: `${(hover.y / height) * 100}%`,
              borderColor: hover.color,
            }}
          >
            <span>{hover.label}</span>
            <strong style={{ color: hover.color }}>{hover.name}: {formatInteger(hover.value)}</strong>
            {hover.revenueCents > 0 ? <em>{formatCurrency(hover.revenueCents)}</em> : null}
          </div>
        ) : null}
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico diário de linhas por setor">
          {yTicks.map((tick) => {
            const y = yForValue(tick);
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="admin-dashboard-grid-line" />
                <text x={padding.left - 12} y={y + 4} textAnchor="end" className="admin-dashboard-axis-label">{formatInteger(tick)}</text>
              </g>
            );
          })}
          {totalPath ? <path d={totalPath} className="admin-dashboard-section-line" style={{ stroke: "#16a34a" }} /> : null}
          {totalPoints.map((point) => point.value > 0 ? (
            <circle
              key={`total-${point.label}`}
              cx={point.x}
              cy={point.y}
              r="9"
              className="admin-dashboard-line-hit"
              onMouseEnter={() => setHover({ ...point, name: "Compras", color: "#16a34a" })}
            />
          ) : null)}
          {courtesyPath ? <path d={courtesyPath} className="admin-dashboard-section-line" style={{ stroke: "#3b82f6" }} /> : null}
          {courtesyPoints.map((point) => point.value > 0 ? (
            <circle
              key={`courtesy-${point.label}`}
              cx={point.x}
              cy={point.y}
              r="5"
              className="admin-dashboard-line-point"
              style={{ fill: "#3b82f6" }}
              onMouseEnter={() => setHover({ ...point, name: "Cortesias", color: "#3b82f6" })}
            />
          ) : null)}
          {data.range === "day"
            ? SIX_HOUR_BOUNDARIES.map((hour) => (
                <text key={hour} x={xForHour(hour)} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{formatHour(hour)}</text>
              ))
            : rows.map((row, index) => index % labelStep === 0 || index === rows.length - 1 ? (
                <text key={row.key} x={xForIndex(index)} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{row.label}</text>
              ) : null)}
        </svg>
      </div>
    </div>
  );
}

export function GeneralSalesLineChart({ rows }: { rows: GeneralDashboardPeriod[] }) {
  const [hover, setHover] = useState<GeneralDashboardPeriod | null>(null);
  const width = 960;
  const height = 150;
  const padding = { top: 16, right: 28, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.ticketsSold, row.courtesyTickets]));
  const yTicks = [maxValue, Math.round(maxValue * 0.5), 0].filter((value, index, values) => values.indexOf(value) === index);
  const xForIndex = (index: number) => padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const xForHour = (hour: number) => padding.left + (hour / 24) * chartWidth;
  const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const pointRows = rows.map((row, index) => ({
    row,
    x: row.positionHour !== undefined ? xForHour(row.positionHour) : xForIndex(index),
    purchaseY: yForValue(row.ticketsSold),
    courtesyY: yForValue(row.courtesyTickets),
  }));
  const purchasePath = buildSmoothLinePath(pointRows.map((point) => ({ x: point.x, y: point.purchaseY })));
  const courtesyPath = buildSmoothLinePath(pointRows.map((point) => ({ x: point.x, y: point.courtesyY })));
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));
  const activePoint = hover ? pointRows.find((point) => point.row.key === hover.key) : null;

  return (
    <div className="admin-general-line-chart" onMouseLeave={() => setHover(null)}>
      <div className="admin-dashboard-line-legend">
        <span><i style={{ background: "#16a34a" }} />Compras</span>
        <span><i style={{ background: "#3b82f6" }} />Cortesias</span>
      </div>
      <div className="admin-dashboard-chart-plot">
        {hover && activePoint ? (
          <div
            className="admin-dashboard-line-tooltip"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(Math.min(activePoint.purchaseY, activePoint.courtesyY) / height) * 100}%`,
              borderColor: "#16a34a",
            }}
          >
            <span>{hover.intervalLabel ?? hover.label}</span>
            <strong style={{ color: "#16a34a" }}>{formatInteger(hover.ticketsSold)} compras</strong>
            <em>{formatInteger(hover.courtesyTickets)} cortesias</em>
          </div>
        ) : null}
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico geral de vendas por período">
          {yTicks.map((tick) => {
            const y = yForValue(tick);
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="admin-dashboard-grid-line" />
                <text x={padding.left - 12} y={y + 4} textAnchor="end" className="admin-dashboard-axis-label">{formatInteger(tick)}</text>
              </g>
            );
          })}
          <path d={purchasePath} className="admin-dashboard-section-line" style={{ stroke: "#16a34a" }} />
          <path d={courtesyPath} className="admin-dashboard-section-line" style={{ stroke: "#3b82f6" }} />
          {pointRows.map((point) => (
            <circle
              key={point.row.key}
              cx={point.x}
              cy={Math.min(point.purchaseY, point.courtesyY)}
              r="9"
              className="admin-dashboard-line-hit"
              onMouseEnter={() => setHover(point.row)}
            />
          ))}
          {rows.every((row) => row.positionHour !== undefined)
            ? SIX_HOUR_BOUNDARIES.map((hour) => (
                <text key={hour} x={xForHour(hour)} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{formatHour(hour)}</text>
              ))
            : pointRows.map((point, index) => index % labelStep === 0 || index === pointRows.length - 1 ? (
                <text key={point.row.key} x={point.x} y={height - 14} textAnchor="middle" className="admin-dashboard-axis-label">{point.row.label}</text>
              ) : null)}
        </svg>
      </div>
    </div>
  );
}
