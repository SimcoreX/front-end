"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/classNames";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export type PnlPanelTrade = {
  id: string;
  date: string;
  pnl: number;
  outcome: "win" | "loss" | "open" | "breakeven";
};

type PnlDetailsPanelProps = {
  trades: PnlPanelTrade[];
  isLoading?: boolean;
  initialBalance?: number;
};

type RangeKey = "all" | "day" | "hour" | "min15";

type DailySummary = {
  date: string;
  pnl: number;
};

const RANGE_LIMITS: Record<RangeKey, number> = {
  all: Number.POSITIVE_INFINITY,
  day: 30,
  hour: 12,
  min15: 6,
};

export function PnlDetailsPanel({ trades, isLoading = false, initialBalance = 150000 }: PnlDetailsPanelProps) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<RangeKey>("all");
  const [thresholdInput, setThresholdInput] = useState("0");
  const [breakevenThreshold, setBreakevenThreshold] = useState(0);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const byDate = useMemo(() => {
    const grouped = new Map<string, DailySummary>();
    trades.forEach((trade) => {
      const date = trade.date;
      const current = grouped.get(date) ?? { date, pnl: 0 };
      grouped.set(date, { ...current, pnl: current.pnl + trade.pnl });
    });

    return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [trades]);

  const windowData = useMemo(() => {
    const limit = RANGE_LIMITS[range];
    const summarySlice = Number.isFinite(limit) ? byDate.slice(-limit) : byDate;

    const selectedDates = new Set(summarySlice.map((item) => item.date));
    const scopedTrades = trades.filter((trade) => selectedDates.has(trade.date));

    const labels = summarySlice.map((item) => formatCompactDate(item.date, i18n.language));
    const dailyPnl = summarySlice.map((item) => item.pnl);

    const cumulativePnl = dailyPnl.reduce<number[]>((acc, value) => {
      const previous = acc.length > 0 ? acc[acc.length - 1] : 0;
      acc.push(previous + value);
      return acc;
    }, []);

    const totalPnl = scopedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const accountBalance = initialBalance + totalPnl;
    const wins = scopedTrades.filter((trade) => trade.outcome === "win").length;
    const losses = scopedTrades.filter((trade) => trade.outcome === "loss").length;
    const resolvedTrades = wins + losses;
    const winRate = resolvedTrades > 0 ? Math.round((wins / resolvedTrades) * 10000) / 100 : 0;
    const totalTrades = scopedTrades.length;
    const breakevenTrades = scopedTrades.filter(
      (trade) => trade.outcome === "breakeven" || Math.abs(trade.pnl) <= breakevenThreshold
    ).length;

    return {
      labels,
      cumulativePnl,
      totalPnl,
      accountBalance,
      wins,
      losses,
      winRate,
      totalTrades,
      breakevenTrades,
    };
  }, [byDate, breakevenThreshold, i18n.language, initialBalance, range, trades]);

  const chartGeometry = useMemo(() => {
    const width = 900;
    const height = 250;
    const paddingLeft = 36;
    const paddingRight = 18;
    const paddingTop = 16;
    const paddingBottom = 30;

    const points = windowData.cumulativePnl;
    const maxValue = Math.max(0, ...points);
    const minValue = Math.min(0, ...points);
    const span = Math.max(1, maxValue - minValue);
    const usableWidth = width - paddingLeft - paddingRight;
    const usableHeight = height - paddingTop - paddingBottom;

    const getPoint = (index: number, value: number) => {
      const x =
        points.length <= 1
          ? paddingLeft + usableWidth / 2
          : paddingLeft + (index / (points.length - 1)) * usableWidth;
      const y = paddingTop + ((maxValue - value) / span) * usableHeight;
      return { x, y };
    };

    const svgPoints = points.map((value, index) => getPoint(index, value));
    const linePath = svgPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");

    const firstPoint = svgPoints[0] ?? { x: paddingLeft, y: height - paddingBottom };
    const lastPoint = svgPoints[svgPoints.length - 1] ?? firstPoint;
    const areaPath = `${linePath} L${lastPoint.x} ${height - paddingBottom} L${firstPoint.x} ${height - paddingBottom} Z`;

    const gridValues = Array.from({ length: 5 }).map((_, index) => {
      const ratio = index / 4;
      const value = maxValue - ratio * span;
      const y = paddingTop + ratio * usableHeight;
      return { value, y };
    });

    return {
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingBottom,
      linePath,
      areaPath,
      points: svgPoints,
      gridValues,
    };
  }, [windowData.cumulativePnl]);

  const xAxisTicks = useMemo(() => {
    const labels = windowData.labels;
    if (!labels.length) return [] as Array<{ index: number; label: string }>;
    if (labels.length <= 4) {
      return labels.map((label, index) => ({ index, label }));
    }

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount }).map((_, idx) => {
      const ratio = tickCount === 1 ? 0 : idx / (tickCount - 1);
      const index = Math.round(ratio * (labels.length - 1));
      return { index, label: labels[index] };
    });

    const uniqueTicks = new Map<number, string>();
    ticks.forEach((tick) => {
      if (!uniqueTicks.has(tick.index)) {
        uniqueTicks.set(tick.index, tick.label);
      }
    });

    return Array.from(uniqueTicks.entries()).map(([index, label]) => ({ index, label }));
  }, [windowData.labels]);

  const handleApplyThreshold = () => {
    const parsed = Number(thresholdInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setBreakevenThreshold(0);
      setThresholdInput("0");
      return;
    }

    const normalized = Math.round(parsed * 100) / 100;
    setBreakevenThreshold(normalized);
    setThresholdInput(String(normalized));
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <Skeleton className="h-5 w-38 rounded" />
        <Skeleton className="mt-2 h-3 w-28 rounded" />
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`pnl-panel-skeleton-${index}`} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-56 w-full rounded-xl" />
      </div>
    );
  }

  const locale = getLocale(i18n.language);
  const hoveredPoint =
    hoveredPointIndex !== null &&
    hoveredPointIndex >= 0 &&
    hoveredPointIndex < chartGeometry.points.length
      ? {
          point: chartGeometry.points[hoveredPointIndex],
          label: windowData.labels[hoveredPointIndex],
          value: windowData.cumulativePnl[hoveredPointIndex],
        }
      : null;
  const hoveredTooltip = hoveredPoint
    ? {
        width: 146,
        height: 48,
        x: clampNumber(
          hoveredPoint.point.x - 146 / 2,
          chartGeometry.paddingLeft,
          chartGeometry.width - chartGeometry.paddingRight - 146
        ),
        y: Math.max(8, hoveredPoint.point.y - 48 - 10),
      }
    : null;

  return (
    <section className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-lg font-semibold text-white">{t("history.pnlPanel.title")}</p>
          <p className="text-xs text-primary-300">{t("history.pnlPanel.subtitle")}</p>
        </div>

        <div className="inline-flex w-full overflow-hidden rounded-lg border border-[#2E5C8A]/60 bg-[#091422] lg:w-auto">
          {(["all", "day", "hour", "min15"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold transition",
                range === key
                  ? "bg-[#2D66A0] text-white"
                  : "text-primary-200 hover:bg-[#14304b] hover:text-white"
              )}
            >
              {t(`history.pnlPanel.range.${key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-6">
        <MetricBlock
          label={t("history.pnlPanel.metrics.totalPnl")}
          value={formatMoney(windowData.totalPnl, locale)}
          tone={windowData.totalPnl >= 0 ? "positive" : "negative"}
        />
        <MetricBlock
          label={t("history.pnlPanel.metrics.accountBalance")}
          value={formatMoney(windowData.accountBalance, locale)}
          tone="neutral"
        />
        <MetricBlock
          label={t("history.pnlPanel.metrics.winRate")}
          value={`${windowData.winRate.toFixed(2)}%`}
          tone={windowData.winRate >= 50 ? "positive" : "negative"}
        />
        <MetricBlock
          label={t("history.pnlPanel.metrics.totalTrades")}
          value={`${windowData.totalTrades}`}
          helper={t("history.pnlPanel.metrics.winsLosses", {
            wins: windowData.wins,
            losses: windowData.losses,
          })}
          tone="neutral"
        />
        <MetricBlock
          label={t("history.pnlPanel.metrics.breakevenTrades")}
          value={`${windowData.breakevenTrades}`}
          helper={t("history.pnlPanel.metrics.thresholdValue", {
            value: formatMoney(breakevenThreshold, locale),
          })}
          tone="neutral"
        />

        <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#0b1a2b]/80 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.08em] text-primary-300">
            {t("history.pnlPanel.threshold.label")}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value)}
              className="w-full rounded-md border border-[#2E5C8A]/50 bg-[#08111d] px-2 py-1.5 text-sm text-white outline-none transition focus:border-[#4C87BA]/90"
              aria-label={t("history.pnlPanel.threshold.label")}
            />
            <button
              type="button"
              onClick={handleApplyThreshold}
              className="rounded-md border border-[#2E5C8A]/60 bg-[#17324f] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:border-[#4C87BA]/90 hover:bg-[#204164]"
            >
              {t("history.pnlPanel.threshold.apply")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#2E5C8A]/25 bg-[#07121f]/70 p-3">
        {windowData.cumulativePnl.length === 0 ? (
          <p className="py-14 text-center text-sm text-primary-300">{t("history.pnlPanel.empty")}</p>
        ) : (
          <div>
            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="h-56 w-full"
              role="img"
              onMouseLeave={() => setHoveredPointIndex(null)}
            >
              <defs>
                <linearGradient id="pnlAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2D8CFF" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#2D8CFF" stopOpacity="0.04" />
                </linearGradient>
              </defs>

              {chartGeometry.gridValues.map((tick) => (
                <g key={`pnl-grid-${tick.y}`}>
                  <line
                    x1={chartGeometry.paddingLeft}
                    y1={tick.y}
                    x2={chartGeometry.width - chartGeometry.paddingRight}
                    y2={tick.y}
                    stroke="rgba(255,255,255,0.12)"
                    strokeDasharray="5 5"
                  />
                  <text x={4} y={tick.y + 4} fill="rgba(225,226,228,0.76)" fontSize="11">
                    {formatCompactMoney(tick.value, locale)}
                  </text>
                </g>
              ))}

              <path d={chartGeometry.areaPath} fill="url(#pnlAreaGradient)" />
              <path
                d={chartGeometry.linePath}
                fill="none"
                stroke="#2D8CFF"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {chartGeometry.points.map((point, index) => (
                <g
                  key={`pnl-point-${point.x}-${point.y}-${index}`}
                  onMouseEnter={() => setHoveredPointIndex(index)}
                  className="cursor-pointer"
                >
                  <circle cx={point.x} cy={point.y} r={10} fill="transparent" />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={
                      hoveredPointIndex === index
                        ? 5
                        : index === chartGeometry.points.length - 1
                          ? 4
                          : 2.75
                    }
                    fill="#2D8CFF"
                    stroke="#0b1726"
                    strokeWidth="1.5"
                  />
                </g>
              ))}

              {hoveredPoint && hoveredTooltip && (
                <g transform={`translate(${hoveredTooltip.x} ${hoveredTooltip.y})`} pointerEvents="none">
                  <rect
                    width={hoveredTooltip.width}
                    height={hoveredTooltip.height}
                    rx={10}
                    fill="#1B314B"
                    stroke="rgba(46,92,138,0.65)"
                  />
                  <text x={10} y={18} fill="#FFFFFF" fontSize="12" fontWeight="700">
                    {hoveredPoint.label}
                  </text>
                  <text x={10} y={35} fill="rgba(225,226,228,0.92)" fontSize="12">
                    {formatMoney(hoveredPoint.value, locale)}
                  </text>
                </g>
              )}

              {xAxisTicks.map((tick) => {
                const point = chartGeometry.points[tick.index];
                if (!point) return null;

                const isFirst = tick.index === 0;
                const isLast = tick.index === windowData.labels.length - 1;

                return (
                  <text
                    key={`pnl-tick-${tick.label}-${tick.index}`}
                    x={point.x}
                    y={chartGeometry.height - 4}
                    fill="rgba(156,158,162,0.9)"
                    fontSize="10"
                    textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                    style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
                  >
                    {tick.label}
                  </text>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}

type MetricBlockProps = {
  label: string;
  value: string;
  helper?: string;
  tone: "positive" | "negative" | "neutral";
};

function MetricBlock({ label, value, helper, tone }: MetricBlockProps) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-white";

  return (
    <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#0b1a2b]/80 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.08em] text-primary-300">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold leading-none", valueClass)}>{value}</p>
      {helper && <p className="mt-1 text-[10px] text-primary-300">{helper}</p>}
    </div>
  );
}

function formatCompactDate(value: string, language: string) {
  const locale = getLocale(language);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactMoney(value: number, locale: string) {
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    return `${value < 0 ? "-" : ""}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(abs / 1000000)}M`;
  }

  if (abs >= 1000) {
    return `${value < 0 ? "-" : ""}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(abs / 1000)}k`;
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
}

function getLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
