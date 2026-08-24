import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Charts, hand-built in SVG.
 *
 * No charting library. Three chart types at this scale are a few hundred lines
 * of SVG, and writing them directly buys three things a library would not:
 * the marks inherit the product's own colour tokens (so they are correct in
 * both themes automatically), there is no instantly recognisable library
 * default look, and the bundle carries no extra dependency.
 *
 * Accessibility: every chart renders a visually-hidden table of the same
 * numbers, so the data is available to a screen reader rather than being
 * locked inside a picture.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function DataTable({ caption, rows }: { caption: string; rows: Array<[string, string | number]> }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Donut — status distribution
// ---------------------------------------------------------------------------

export interface DonutSegment {
  label: string;
  value: number;
  className: string;
}

/**
 * A donut rather than a pie: the hole carries the total, which is the number
 * the reader actually wants, and arc-length comparison is easier without a
 * filled centre competing for attention.
 */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 168,
  thickness = 18,
  className,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: number | string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className={cn('flex items-center gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="stroke-chart-grid"
            strokeWidth={thickness}
          />

          {total > 0 &&
            segments.map((segment) => {
              if (segment.value === 0) return null;
              const fraction = segment.value / total;
              const dash = fraction * circumference;
              // A 2px gap between segments so adjacent arcs stay distinguishable
              // even when their colours are close in value.
              const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
              const element = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  className={segment.className}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, dash - gap)} ${circumference - Math.max(0, dash - gap)}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{
                    transition: 'stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              );
              offset += dash;
              return element;
            })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight text-foreground tabular">
            {centerValue}
          </span>
          <span className="mt-0.5 text-[11px] uppercase tracking-wider text-subtle">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {segments.map((segment) => {
          const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <li key={segment.label} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn('size-2.5 shrink-0 rounded-sm', segment.className)}
                style={{ backgroundColor: 'currentColor' }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{segment.label}</span>
              <span className="shrink-0 text-[13px] font-semibold text-foreground tabular">
                {segment.value}
              </span>
              <span className="w-9 shrink-0 text-right text-xs text-subtle tabular">{pct}%</span>
            </li>
          );
        })}
      </ul>

      <DataTable
        caption={`${centerLabel}: ${centerValue} total`}
        rows={segments.map((segment) => [segment.label, segment.value])}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars — category distribution
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  value: number;
  /** Portion of `value` still unresolved, drawn as a darker inner segment. */
  secondaryValue?: number;
}

/**
 * Horizontal bars, because category names are words — rotating them under a
 * vertical axis would make them harder to read for no gain.
 *
 * The inner segment shows what is still open within each category, which turns
 * "which category gets the most complaints" into the more useful "which
 * category has the most outstanding work".
 */
export function BarChart({
  data,
  className,
  maxRows = 8,
}: {
  data: BarDatum[];
  className?: string;
  maxRows?: number;
}) {
  const rows = data.slice(0, maxRows);
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0) {
    return <p className="py-8 text-center text-[13px] text-subtle">No data to display yet.</p>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {rows.map((row, index) => {
        const width = (row.value / max) * 100;
        const openWidth = row.secondaryValue ? (row.secondaryValue / max) * 100 : 0;

        return (
          <div key={row.label} className="group">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-muted">{row.label}</span>
              <span className="shrink-0 text-[13px] font-medium text-foreground tabular">
                {row.value}
                {row.secondaryValue !== undefined ? (
                  <span className="ml-1.5 text-xs font-normal text-subtle">
                    {row.secondaryValue} open
                  </span>
                ) : null}
              </span>
            </div>

            <div className="relative h-2 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border/60">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-chart-1/35"
                style={{
                  width: `${width}%`,
                  transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                  transitionDelay: `${index * 40}ms`,
                }}
              />
              {openWidth > 0 ? (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-chart-1"
                  style={{
                    width: `${openWidth}%`,
                    transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                    transitionDelay: `${index * 40 + 80}ms`,
                  }}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      <DataTable
        caption="Complaints by category"
        rows={rows.map((row) => [row.label, row.value])}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dual line — 30-day trend
// ---------------------------------------------------------------------------

export interface TrendDatum {
  date: string;
  raised: number;
  resolved: number;
}

/**
 * Raised against resolved over 30 days, as a 7-day trailing average.
 *
 * Two decisions here are about honesty of the picture, not decoration:
 *
 *  • **Rolling average, not raw daily counts.** A society logs one or two
 *    complaints a day, so a raw daily line oscillates between 0, 1 and 2 and
 *    reads as violent noise that means nothing. A 7-day trailing average shows
 *    the thing the chart is actually for — whether the queue is growing — and
 *    the axis is labelled so nobody mistakes it for daily totals.
 *
 *  • **Two clearly separated hues.** Raised and resolved must be
 *    distinguishable at a glance, so they sit far apart on the wheel (blue vs
 *    green) rather than being two neighbouring shades of the brand colour.
 *
 * The pair together answers the only useful question: is the team keeping up?
 * Either line alone says almost nothing.
 */
export function TrendChart({
  data,
  height = 180,
  className,
}: {
  data: TrendDatum[];
  height?: number;
  className?: string;
}) {
  if (data.length < 2) {
    return <p className="py-8 text-center text-[13px] text-subtle">Not enough history yet.</p>;
  }

  const WINDOW = 7;
  const smoothed = data.map((_, index) => {
    const from = Math.max(0, index - WINDOW + 1);
    const slice = data.slice(from, index + 1);
    return {
      date: data[index]!.date,
      raised: slice.reduce((sum, point) => sum + point.raised, 0) / slice.length,
      resolved: slice.reduce((sum, point) => sum + point.resolved, 0) / slice.length,
    };
  });

  const width = 720;
  const padding = { top: 12, right: 8, bottom: 22, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const peak = Math.max(
    0.5,
    ...smoothed.flatMap((point) => [point.raised, point.resolved]),
  );
  // Round up to a clean tick so the axis labels are not long decimals.
  const axisMax = Math.ceil(peak * 2) / 2;

  const x = (index: number) => padding.left + (index / (smoothed.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + plotHeight - (value / axisMax) * plotHeight;

  /**
   * Monotone cubic interpolation.
   *
   * A plain bezier through these points would overshoot and dip below zero
   * between them, implying negative complaint counts. Monotone tangents
   * guarantee the curve never leaves the range of the data it connects.
   */
  const toPath = (key: 'raised' | 'resolved') => {
    const points = smoothed.map((point, index) => ({ x: x(index), y: y(point[key]) }));
    if (points.length < 2) return '';

    let path = `M ${points[0]!.x} ${points[0]!.y}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const current = points[i]!;
      const next = points[i + 1]!;
      const controlX = (current.x + next.x) / 2;
      path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const areaPath = `${toPath('raised')} L ${x(smoothed.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  const gridValues = [0, axisMax / 2, axisMax];
  const formatTick = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-3" />
          Raised
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-6" />
          Resolved
        </span>
        <span className="ml-auto text-[11px] text-subtle">7-day average per day</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-hidden
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-chart-grid"
              strokeWidth={1}
            />
            <text
              x={padding.left - 7}
              y={y(value) + 3}
              textAnchor="end"
              className="fill-current text-[9px] text-subtle"
            >
              {formatTick(value)}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="text-chart-3" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" className="text-chart-3" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#trend-area)" />

        <path
          d={toPath('resolved')}
          fill="none"
          className="stroke-chart-6 animate-draw-line"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={2400}
          style={{ ['--dash' as string]: '2400' }}
        />
        <path
          d={toPath('raised')}
          fill="none"
          className="stroke-chart-3 animate-draw-line"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={2400}
          style={{ ['--dash' as string]: '2400' }}
        />

        {/* Only the final point is marked — a dot per day would be noise. */}
        <circle
          cx={x(smoothed.length - 1)}
          cy={y(smoothed[smoothed.length - 1]!.raised)}
          r={3}
          className="fill-chart-3"
        />
        <circle
          cx={x(smoothed.length - 1)}
          cy={y(smoothed[smoothed.length - 1]!.resolved)}
          r={3}
          className="fill-chart-6"
        />
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[10px] text-subtle">
        <span>{formatAxisDate(data[0]!.date)}</span>
        <span>{formatAxisDate(data[Math.floor(data.length / 2)]!.date)}</span>
        <span>Today</span>
      </div>

      <DataTable
        caption="Complaints raised and resolved over the last 30 days"
        rows={data.map((point) => [point.date, `${point.raised} raised, ${point.resolved} resolved`])}
      />
    </div>
  );
}

function formatAxisDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Stacked proportion bar — priority mix
// ---------------------------------------------------------------------------

export function ProportionBar({
  segments,
  className,
}: {
  segments: Array<{ label: string; value: number; className: string }>;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-[13px] text-subtle">Nothing outstanding.</p>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        {segments.map((segment, index) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              className={cn(segment.className, index > 0 && 'ml-px')}
              style={{
                width: `${(segment.value / total) * 100}%`,
                transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          ) : null,
        )}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2 rounded-sm', segment.className)} />
            <span className="text-xs text-muted">{segment.label}</span>
            <span className="text-xs font-semibold text-foreground tabular">{segment.value}</span>
          </li>
        ))}
      </ul>

      <DataTable
        caption="Outstanding complaints by priority"
        rows={segments.map((segment) => [segment.label, segment.value])}
      />
    </div>
  );
}
