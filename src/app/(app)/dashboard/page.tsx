"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { Skeleton } from "@/components/ui/Skeleton";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { cn } from "@/lib/classNames";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DashboardOverviewResponse, DashboardWeekdayKey } from "@/lib/types/dashboard";

type DashboardViewData = {
  summary: {
    timeInvestedMinutes: number;
    totalTrades: number;
    completedSessions: number;
    historyCount: number;
  };
  pnlSeries: number[];
  marketSeries: number[];
  tradesPerDay: number[];
  winRatePerDay: number[];
  labelsMonthly: string[];
  labelsWeekly: string[];
  updatedAt: string;
  source: "live" | "mock";
};

const WEEKDAY_KEYS: DashboardWeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function DashboardPage() {
  const { t, i18n } = useTranslation();

  const fallbackOverview = useMemo(() => buildFallbackOverview(), []);
  const [dashboard, setDashboard] = useState<DashboardViewData>(() =>
    mapOverviewToView(fallbackOverview, i18n.language, "mock")
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadOverview = async () => {
      setIsLoading(true);
      setHasError(false);

      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const response = await getDashboardOverview({ timezone });
        if (cancelled) return;
        setDashboard(mapOverviewToView(response, i18n.language, "live"));
      } catch {
        if (cancelled) return;
        setDashboard(mapOverviewToView(fallbackOverview, i18n.language, "mock"));
        setHasError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [fallbackOverview, i18n.language]);

  const cards = [
    {
      title: t("dashboard.charts.tradesPnl"),
      type: "line" as const,
      data: dashboard.pnlSeries,
      labels: dashboard.labelsMonthly,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.marketTracker"),
      type: "line" as const,
      data: dashboard.marketSeries,
      labels: dashboard.labelsMonthly,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.tradingDays"),
      type: "bar" as const,
      data: dashboard.tradesPerDay,
      labels: dashboard.labelsWeekly,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.winRate"),
      type: "bar" as const,
      data: dashboard.winRatePerDay,
      labels: dashboard.labelsWeekly,
      color: "#2E5C8A",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("dashboard.title")}</PageTitle>
      {hasError && (
        <p className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {t("dashboard.errors.loadFailed")}
        </p>
      )}

      {isLoading && <DashboardSkeleton />}

      {!isLoading && (
        <>
          <SummaryCards
            items={[
              {
                label: t("dashboard.summary.timeInvested"),
                value: `${Math.round(dashboard.summary.timeInvestedMinutes / 60)}h`,
                hint: t("dashboard.summary.thisQuarter"),
              },
              {
                label: t("dashboard.summary.tradesMonth"),
                value: `${dashboard.summary.totalTrades}`,
                hint: t("dashboard.summary.thisMonth"),
              },
              {
                label: t("dashboard.summary.history"),
                value: `${dashboard.summary.historyCount}`,
                hint: t("dashboard.summary.allTime"),
              },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {cards.map((card) => (
              <ChartCard
                key={card.title}
                title={card.title}
                data={card.data}
                color={card.color}
                type={card.type}
                labels={card.labels}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`summary-skeleton-${index}`}
            className="rounded-2xl border border-primary-800/70 bg-primary-900/60 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          >
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="mt-3 h-8 w-20 rounded" />
            <Skeleton className="mt-3 h-3 w-24 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`chart-skeleton-${index}`}
            className="rounded-2xl border border-primary-800/70 bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-6 w-40 rounded" />
              </div>
            </div>
            <Skeleton className="mt-4 h-56 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </>
  );
}

function buildFallbackOverview(): DashboardOverviewResponse {
  const now = new Date();

  const months = Array.from({ length: 12 }, (_, index) =>
    `${now.getUTCFullYear()}-${String(index + 1).padStart(2, "0")}`
  );

  return {
    summary: {
      timeInvestedMinutes: 0,
      totalTrades: 0,
      completedSessions: 0,
      historyCount: 0,
    },
    charts: {
      pnlCumulativeByMonth: months.map((month) => ({
        month,
        value: 0,
      })),
      marketTrackerByMonth: months.map((month) => ({
        month,
        value: 0,
      })),
      tradesByWeekday: WEEKDAY_KEYS.map((weekday) => ({
        weekday,
        value: 0,
      })),
      winRateByWeekday: WEEKDAY_KEYS.map((weekday) => ({
        weekday,
        value: 0,
      })),
    },
    updatedAt: new Date().toISOString(),
  };
}

function mapOverviewToView(
  overview: DashboardOverviewResponse,
  language: string,
  source: "live" | "mock"
): DashboardViewData {
  const months = Array.from(
    new Set([
      ...overview.charts.pnlCumulativeByMonth.map((point) => point.month),
      ...overview.charts.marketTrackerByMonth.map((point) => point.month),
    ])
  ).sort();

  const pnlByMonth = new Map(
    overview.charts.pnlCumulativeByMonth.map((point) => [point.month, Number(point.value) || 0])
  );
  const marketByMonth = new Map(
    overview.charts.marketTrackerByMonth.map((point) => [point.month, Number(point.value) || 0])
  );

  const tradesByWeekday = new Map(
    overview.charts.tradesByWeekday.map((point) => [point.weekday, Number(point.value) || 0])
  );
  const winRateByWeekday = new Map(
    overview.charts.winRateByWeekday.map((point) => [point.weekday, Number(point.value) || 0])
  );

  return {
    summary: {
      ...overview.summary,
      historyCount: overview.summary.historyCount ?? overview.summary.totalTrades,
    },
    pnlSeries: months.map((month) => pnlByMonth.get(month) ?? 0),
    marketSeries: months.map((month) => marketByMonth.get(month) ?? 0),
    tradesPerDay: WEEKDAY_KEYS.map((weekday) => tradesByWeekday.get(weekday) ?? 0),
    winRatePerDay: WEEKDAY_KEYS.map((weekday) => winRateByWeekday.get(weekday) ?? 0),
    labelsMonthly: months.map((month) => formatMonthLabel(month, language)),
    labelsWeekly: getWeekdayLabels(language),
    updatedAt: overview.updatedAt,
    source,
  };
}

function formatMonthLabel(month: string, language: string) {
  const [year, value] = month.split("-");
  const monthIndex = Number(value) - 1;
  if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return month;

  const locale = toLocale(language);
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(Date.UTC(Number(year) || 1970, monthIndex, 1))
  );
}

function getWeekdayLabels(language: string) {
  if (language.startsWith("pt")) return ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
  if (language.startsWith("es")) return ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

function toLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}

type SummaryItem = {
  label: string;
  value: string;
  hint: string;
};

function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-primary-800/70 bg-primary-900/60 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <p className="text-xs uppercase tracking-wide text-primary-300">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{item.value}</p>
          <p className="text-xs text-primary-300">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

type ChartCardProps = {
  title: string;
  data: number[];
  labels: string[];
  color: string;
  type: "line" | "bar";
};

function ChartCard({ title, data, labels, color, type }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-primary-800/70 bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <p className="text-lg font-semibold text-white">{title}</p>

      <div className="mt-4 h-56">
        {type === "line" ? (
          <LineChart data={data} color={color} labels={labels} />
        ) : (
          <BarChart data={data} color={color} labels={labels} />
        )}
      </div>
    </div>
  );
}

type BaseChartProps = {
  data: number[];
  labels: string[];
  color: string;
};

function LineChart({ data, labels, color }: BaseChartProps) {
  const width = 600;
  const height = 200;
  const paddingX = 16;
  const paddingY = 12;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const yRange = max === min ? 1 : max - min;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hasSinglePoint = data.length <= 1;

  const getPoint = (idx: number) => {
    const x = hasSinglePoint
      ? paddingX + innerWidth / 2
      : paddingX + (idx / (data.length - 1)) * innerWidth;
    const y = paddingY + (1 - (data[idx] - min) / yRange) * innerHeight;
    return { x, y };
  };

  const points = data
    .map((_, idx) => {
      const { x, y } = getPoint(idx);
      return `${x},${y}`;
    })
    .join(" ");

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (hasSinglePoint) {
      setHoverIdx(0);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const xPos = event.clientX - rect.left;
    const relative = Math.max(0, Math.min(1, xPos / rect.width));
    const idx = Math.round(relative * (data.length - 1));
    setHoverIdx(idx);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        role="img"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIdx(null)}
        onPointerEnter={() => hasSinglePoint && setHoverIdx(0)}
      >
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        <polygon
          fill="url(#lineFill)"
          points={`${paddingX},${height - paddingY} ${points} ${width - paddingX},${height - paddingY}`}
          opacity="0.6"
        />
        {data.map((value, idx) => {
          const { x, y } = getPoint(idx);
          const isHover = hoverIdx === idx;
          return (
            <circle
              key={`${value}-${idx}`}
              cx={x}
              cy={y}
              r={isHover ? 6 : 4}
              fill={color}
              stroke="#0f172a"
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {hoverIdx !== null && (
        <Tooltip
          label={labels[hoverIdx]}
          value={data[hoverIdx]}
          color={color}
          position={getPoint(hoverIdx)}
          containerWidth={width}
        />
      )}

      <div className="mt-2 flex justify-between text-[10px] text-primary-300">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, labels, color }: BaseChartProps) {
  const height = 200;
  const max = Math.max(...data);
  const min = 0;
  const yRange = max === min ? 1 : max - min;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div className="relative h-full w-full">
      <div className="flex h-52 items-end gap-2">
        {data.map((value, idx) => {
          const barHeight = ((value - min) / yRange) * height;
          const isHover = hoverIdx === idx;
          return (
            <div
              key={`${value}-${idx}`}
              className={cn(
                "flex-1 rounded-t-lg border border-primary-800/70 bg-primary-950/70",
                isHover && "border-white/70"
              )}
              style={{
                height: `${barHeight}px`,
                backgroundColor: `${color}22`,
                borderColor: isHover ? "#ffffffb3" : `${color}44`,
              }}
              aria-label={`${labels[idx]}: ${value}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div
                className="h-full w-full rounded-t-lg"
                style={{ backgroundColor: color, opacity: isHover ? 0.95 : 0.75 }}
              />
            </div>
          );
        })}
      </div>

      {hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-10 left-0 flex w-full justify-center">
          <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <div className="font-semibold text-white">{labels[hoverIdx]}</div>
            <div className="text-primary-100">{data[hoverIdx]}</div>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-[10px] text-primary-300">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

type TooltipProps = {
  label: string;
  value: number;
  color: string;
  position: { x: number; y: number };
  containerWidth: number;
};

function Tooltip({ label, value, color, position, containerWidth }: TooltipProps) {
  const left = Math.min(containerWidth - 80, Math.max(0, position.x - 40));
  const top = Math.max(0, position.y - 48);

  return (
    <div className="pointer-events-none absolute" style={{ transform: `translate(${left}px, ${top}px)` }}>
      <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span className="font-semibold">{label}</span>
        </div>
        <div className="mt-1 text-primary-100">{value}</div>
      </div>
    </div>
  );
}
