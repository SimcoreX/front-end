"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/classNames";
import type { SessionDetailResponse, SessionTradeSummary } from "@/lib/types/trades";
import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type NormalizedSessionTrade = {
  id: string;
  date: string;
  pnl: number;
  outcome: "win" | "loss" | "open" | "breakeven";
  side?: "buy" | "sell";
  durationMs: number | null;
  timestamp: number;
  symbol: string;
  openedAt: string | null;
  closedAt: string | null;
  quantity: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
};

type StatsDateRangePreset = "session" | "today" | "lastWeek" | "lastMonth";

export function SessionReplayStatsPanel({
  session,
  isLoading,
}: {
  session: SessionDetailResponse | null;
  isLoading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = getLocale(i18n.language);
  const [statsDateRangePreset, setStatsDateRangePreset] = useState<StatsDateRangePreset>("session");

  const sessionRange = useMemo(
    () => getSessionCalendarRange(session),
    [session]
  );

  const normalizedTrades = useMemo<NormalizedSessionTrade[]>(() => {
    if (!session?.trades?.length) return [];

    return session.trades
      .map((trade) => normalizeSessionTrade(trade, session))
      .filter((trade): trade is NormalizedSessionTrade => Boolean(trade))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [session]);

  const presetRanges = useMemo(
    () => ({
      today: { start: sessionRange.end, end: sessionRange.end },
      lastWeek: {
        start: clampIsoDate(addISODateDays(sessionRange.end, -6), sessionRange.start, sessionRange.end),
        end: sessionRange.end,
      },
      lastMonth: {
        start: clampIsoDate(addISODateDays(sessionRange.end, -29), sessionRange.start, sessionRange.end),
        end: sessionRange.end,
      },
    }),
    [sessionRange.end, sessionRange.start]
  );

  const statsDateRange = useMemo(() => {
    if (statsDateRangePreset === "today") return presetRanges.today;
    if (statsDateRangePreset === "lastWeek") return presetRanges.lastWeek;
    if (statsDateRangePreset === "lastMonth") return presetRanges.lastMonth;
    return sessionRange;
  }, [presetRanges.lastMonth, presetRanges.lastWeek, presetRanges.today, sessionRange, statsDateRangePreset]);

  const activePreset = statsDateRangePreset;

  const filteredTrades = useMemo(
    () =>
      normalizedTrades.filter(
        (trade) => trade.date >= statsDateRange.start && trade.date <= statsDateRange.end
      ),
    [normalizedTrades, statsDateRange.end, statsDateRange.start]
  );

  const totalTrades = filteredTrades.length;
  const wins = filteredTrades.filter((trade) => trade.outcome === "win").length;
  const losses = filteredTrades.filter((trade) => trade.outcome === "loss").length;
  const resolvedTrades = wins + losses;
  const successRate =
    resolvedTrades > 0
      ? Math.round((wins / resolvedTrades) * 10000) / 100
      : 0;

  const netPnl = filteredTrades.reduce((acc, trade) => acc + trade.pnl, 0);

  const startBalance = Number.isFinite(Number(session?.accountBalanceStart))
    ? Number(session?.accountBalanceStart)
    : 0;
  const overviewMetrics = useMemo(
    () => buildSessionOverviewMetrics(filteredTrades),
    [filteredTrades]
  );

  const fullSessionDailyBalanceSeries = useMemo(
    () => buildSessionDailyBalanceSeries(sessionRange, normalizedTrades, startBalance),
    [sessionRange, normalizedTrades, startBalance]
  );

  const filteredDailyBalanceSeries = useMemo(
    () =>
      fullSessionDailyBalanceSeries.filter(
        (point) => point.date >= statsDateRange.start && point.date <= statsDateRange.end
      ),
    [fullSessionDailyBalanceSeries, statsDateRange.end, statsDateRange.start]
  );

  const balanceChart = useMemo(
    () => buildSessionBalanceChart(filteredDailyBalanceSeries, locale),
    [filteredDailyBalanceSeries, locale]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <Skeleton className="h-6 w-40 rounded" />
          <Skeleton className="mt-2 h-4 w-72 rounded" />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`session-stats-summary-skeleton-${index}`} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <p className="text-sm text-primary-200">{t("trades.replay.loadFailedDescription")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-x-hidden text-sm text-primary-100">
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-white">{t("trades.replay.sessionStats.title")}</p>
          <p className="text-primary-200">{t("trades.replay.sessionStats.description")}</p>
        </div>

        <div className="mt-4 rounded-2xl border border-[#2E5C8A]/45 bg-linear-to-r from-[#050D18] via-[#061729] to-[#132C44] p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="w-full rounded-xl border border-[#93B1CB]/85 bg-[#020811]/55 px-3.5 py-3 sm:px-4 lg:max-w-xl">
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-primary-300">Date Range</p>
              <p className="mt-1 text-base font-semibold text-white sm:text-xl lg:text-2xl">
                {formatSessionStatsRange(statsDateRange.start, statsDateRange.end, i18n.language)}
              </p>
              <p className="mt-1 text-[0.62rem] uppercase tracking-[0.15em] text-primary-300/90 sm:text-[0.7rem]">
                Session: {formatSessionStatsRange(sessionRange.start, sessionRange.end, i18n.language)}
              </p>
            </div>

            <div className="flex w-full gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:w-auto">
              <RangeFilterButton
                label="Today"
                active={activePreset === "today"}
                onClick={() => setStatsDateRangePreset("today")}
              />
              <RangeFilterButton
                label="Last Week"
                active={activePreset === "lastWeek"}
                onClick={() => setStatsDateRangePreset("lastWeek")}
              />
              <RangeFilterButton
                label="Last Month"
                active={activePreset === "lastMonth"}
                onClick={() => setStatsDateRangePreset("lastMonth")}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SessionStatsCard
            label={t("trades.replay.sessionStats.netPnl", { defaultValue: "Total P&L" })}
            value={formatSignedCurrency(netPnl, locale)}
            tone={netPnl >= 0 ? "positive" : "negative"}
            subtitle={t("trades.replay.sessionStats.totalTrades", {
              defaultValue: "Total trades: {{count}}",
              count: totalTrades,
            })}
          />

          <SessionRateGaugeCard
            label={t("trades.replay.sessionStats.successRate", { defaultValue: "Trade Win %" })}
            percentage={successRate}
            positiveCount={wins}
            negativeCount={losses}
          />

          <SessionAvgWinLossCard
            label={t("trades.replay.sessionStats.avgWinLoss", { defaultValue: "Avg Win / Avg Loss" })}
            ratio={overviewMetrics.avgWinLossRatio}
            avgWin={overviewMetrics.avgWin}
            avgLossAbs={overviewMetrics.avgLossAbs}
            locale={locale}
          />

          <SessionRateGaugeCard
            label={t("trades.replay.sessionStats.dayWinRate", { defaultValue: "Day Win %" })}
            percentage={overviewMetrics.dayWinRate}
            positiveCount={overviewMetrics.dayWins}
            negativeCount={overviewMetrics.dayLosses}
          />

          <SessionProfitFactorCard
            label={t("trades.replay.sessionStats.profitFactor", { defaultValue: "Profit Factor" })}
            profitFactor={overviewMetrics.profitFactor}
            grossProfit={overviewMetrics.grossProfit}
            grossLossAbs={overviewMetrics.grossLossAbs}
            locale={locale}
          />

          <SessionStatsCard
            label={t("trades.replay.sessionStats.bestDayShare", { defaultValue: "Best Day % of Total Profit" })}
            value={`${overviewMetrics.bestDayPercentOfProfit.toFixed(2)}%`}
            subtitle={`${t("history.summary.totalPnl")}: ${formatSignedCurrency(overviewMetrics.bestDayPnl, locale)}`}
          />
        </div>
      </div>

      <SessionDailyBalanceChartCard
        title={t("trades.replay.sessionStats.dailyBalance", { defaultValue: "Daily Account Balance" })}
        chart={balanceChart}
        locale={locale}
      />

      <SessionReplayTradeCalendar
        key={`${session.id}-${sessionRange.start}-${sessionRange.end}`}
        session={session}
        trades={normalizedTrades}
      />
    </div>
  );
}

type SessionOverviewMetrics = {
  avgWin: number;
  avgLossAbs: number;
  avgWinLossRatio: number;
  dayWins: number;
  dayLosses: number;
  dayWinRate: number;
  grossProfit: number;
  grossLossAbs: number;
  profitFactor: number;
  bestDayPnl: number;
  bestDayPercentOfProfit: number;
};

type SessionBalancePoint = {
  date: string;
  balance: number;
};

type SessionBalanceChartPoint = {
  x: number;
  y: number;
  date: string;
  balance: number;
};

type SessionBalanceChartModel = {
  linePath: string;
  areaPath: string;
  points: SessionBalanceChartPoint[];
  yGuides: Array<{ y: number; label: string }>;
  xLabels: Array<{ x: number; label: string; anchor: "start" | "middle" | "end" }>;
};

function RangeFilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 min-w-28 items-center justify-center rounded-lg border px-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition sm:min-w-0 sm:text-[0.72rem]",
        active
          ? "border-[#4C87BA]/85 bg-[#0A243D] text-white"
          : "border-[#264767]/55 bg-[#0B1A2B]/85 text-primary-200 hover:border-[#4C87BA]/75 hover:text-white"
      )}
    >
      {label}
    </button>
  );
}

function SessionStatsCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-2xl border border-[#214365]/65 bg-[#060F1B] p-3.5 shadow-[0_10px_26px_rgba(0,0,0,0.25)] sm:p-4">
      <p className="text-[0.67rem] uppercase tracking-[0.18em] text-primary-300">{label}</p>
      <p
        className={cn(
          "mt-2 wrap-break-word text-2xl font-semibold leading-tight text-white sm:text-3xl sm:leading-none",
          tone === "positive" && "text-green-400",
          tone === "negative" && "text-red-400"
        )}
      >
        {value}
      </p>

      {subtitle ? <p className="mt-3 text-[0.72rem] text-primary-300 sm:text-xs">{subtitle}</p> : null}
    </div>
  );
}

function SessionRateGaugeCard({
  label,
  percentage,
  positiveCount,
  negativeCount,
}: {
  label: string;
  percentage: number;
  positiveCount: number;
  negativeCount: number;
}) {
  return (
    <div className="rounded-2xl border border-[#214365]/65 bg-[#060F1B] p-3.5 shadow-[0_10px_26px_rgba(0,0,0,0.25)] sm:p-4">
      <p className="text-[0.67rem] uppercase tracking-[0.18em] text-primary-300">{label}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-2xl font-semibold leading-none text-white sm:text-3xl">{percentage.toFixed(2)}%</p>
        <div className="self-end sm:self-auto">
          <SessionHalfGauge positiveCount={positiveCount} negativeCount={negativeCount} />
        </div>
      </div>
    </div>
  );
}

function SessionAvgWinLossCard({
  label,
  ratio,
  avgWin,
  avgLossAbs,
  locale,
}: {
  label: string;
  ratio: number;
  avgWin: number;
  avgLossAbs: number;
  locale: string;
}) {
  const ratioLabel = Number.isFinite(ratio) ? ratio.toFixed(2) : "∞";
  const disputeTotal = avgWin + avgLossAbs;
  const winPercentage = disputeTotal > 0 ? (avgWin / disputeTotal) * 100 : 0;
  const lossPercentage = disputeTotal > 0 ? (avgLossAbs / disputeTotal) * 100 : 0;

  let winVisualPercentage = winPercentage;
  let lossVisualPercentage = lossPercentage;

  if (winPercentage > 0 && lossPercentage > 0) {
    const minVisualPercentage = 6;
    winVisualPercentage = Math.max(winPercentage, minVisualPercentage);
    lossVisualPercentage = Math.max(lossPercentage, minVisualPercentage);
    const visualTotal = winVisualPercentage + lossVisualPercentage;
    winVisualPercentage = (winVisualPercentage / visualTotal) * 100;
    lossVisualPercentage = (lossVisualPercentage / visualTotal) * 100;
  }

  return (
    <div className="rounded-2xl border border-[#214365]/65 bg-[#060F1B] p-3.5 shadow-[0_10px_26px_rgba(0,0,0,0.25)] sm:p-4">
      <p className="text-[0.67rem] uppercase tracking-[0.18em] text-primary-300">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none text-white sm:text-3xl">{ratioLabel}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="shrink-0 font-semibold text-green-400">{formatCurrency(avgWin, locale)}</span>
        <div className="mx-1 flex-1">
          <div className="h-2.5 overflow-hidden rounded-full border border-[#2E5C8A]/35 bg-[#0B1A2B]/90">
            <div className="flex h-full w-full">
              <div
                className="h-full bg-green-400/90 transition-opacity hover:opacity-80"
                style={{ width: `${winVisualPercentage}%` }}
                title={`Avg Win: ${winPercentage.toFixed(2)}%`}
              />
              <div
                className="h-full bg-red-400/85 transition-opacity hover:opacity-80"
                style={{ width: `${lossVisualPercentage}%` }}
                title={`Avg Loss: ${lossPercentage.toFixed(2)}%`}
              />
            </div>
          </div>
        </div>
        <span className="shrink-0 font-semibold text-red-400">-{formatCurrency(avgLossAbs, locale)}</span>
      </div>
    </div>
  );
}

function SessionProfitFactorCard({
  label,
  profitFactor,
  grossProfit,
  grossLossAbs,
  locale,
}: {
  label: string;
  profitFactor: number;
  grossProfit: number;
  grossLossAbs: number;
  locale: string;
}) {
  const hasData = grossProfit > 0 || grossLossAbs > 0;
  const ratio = grossProfit + grossLossAbs > 0 ? grossProfit / (grossProfit + grossLossAbs) : 0;
  const positivePercent = ratio * 100;
  const negativePercent = 100 - positivePercent;
  const ringSize = 76;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * ratio;

  return (
    <div className="rounded-2xl border border-[#214365]/65 bg-[#060F1B] p-3.5 shadow-[0_10px_26px_rgba(0,0,0,0.25)] sm:p-4">
      <p className="text-[0.67rem] uppercase tracking-[0.18em] text-primary-300">{label}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-2xl font-semibold leading-none text-white sm:text-3xl">
          {Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"}
        </p>

        <svg viewBox={`0 0 ${ringSize} ${ringSize}`} className="h-16 w-16 self-end sm:self-auto" role="img" aria-label="Profit factor">
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="rgba(248,113,113,0.75)"
            strokeWidth="8"
          >
            <title>Loss share: {negativePercent.toFixed(2)}%</title>
          </circle>
          {hasData ? (
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(74,222,128,0.9)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${progress} ${circumference}`}
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            >
              <title>Profit share: {positivePercent.toFixed(2)}%</title>
            </circle>
          ) : null}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[0.72rem] sm:text-xs">
        <span className="font-semibold text-green-400">{formatCurrency(grossProfit, locale)}</span>
        <span className="font-semibold text-red-400">-{formatCurrency(grossLossAbs, locale)}</span>
      </div>
    </div>
  );
}

function SessionHalfGauge({ positiveCount, negativeCount }: { positiveCount: number; negativeCount: number }) {
  const total = positiveCount + negativeCount;
  const positiveRatio = total > 0 ? positiveCount / total : 0;
  const positivePercent = positiveRatio * 100;
  const negativePercent = 100 - positivePercent;

  return (
    <div className="relative h-14 w-24 shrink-0 sm:h-16 sm:w-28">
      <span className="absolute left-1 top-0 text-[0.58rem] font-semibold text-red-400 sm:text-[0.65rem]">{negativeCount}</span>
      <span className="absolute right-1 top-0 text-[0.58rem] font-semibold text-green-400 sm:text-[0.65rem]">{positiveCount}</span>

      <svg viewBox="0 0 120 72" className="h-full w-full" role="img" aria-label="Win and loss ratio">
        <path
          d="M 14 58 A 46 46 0 0 1 106 58"
          fill="none"
          stroke="rgba(248,113,113,0.85)"
          strokeWidth="10"
          strokeLinecap="round"
        >
          <title>Losses: {negativePercent.toFixed(2)}%</title>
        </path>
        <path
          d="M 14 58 A 46 46 0 0 1 106 58"
          fill="none"
          stroke="rgba(74,222,128,0.95)"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${positiveRatio * 100} 100`}
        >
          <title>Wins: {positivePercent.toFixed(2)}%</title>
        </path>
      </svg>
    </div>
  );
}

function SessionDailyBalanceChartCard({
  title,
  chart,
  locale,
}: {
  title: string;
  chart: SessionBalanceChartModel;
  locale: string;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<SessionBalanceChartPoint | null>(null);

  const tooltipX = hoveredPoint ? Math.max(128, Math.min(792, hoveredPoint.x)) : 0;
  const tooltipY = hoveredPoint ? Math.max(62, hoveredPoint.y - 14) : 0;

  return (
    <div className="rounded-2xl border border-[#214365]/65 bg-[#060F1B] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.28)] sm:p-5">
      <p className="text-sm font-semibold text-white sm:text-base">{title}</p>

      <div className="mt-3">
        <svg
          viewBox="0 0 920 300"
          className="h-55 w-full sm:h-72"
          role="img"
          aria-label="Daily account balance chart"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="session-balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(203,213,225,0.32)" />
              <stop offset="100%" stopColor="rgba(203,213,225,0.02)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="920" height="300" fill="transparent" />

          {chart.yGuides.map((guide, index) => (
            <g key={`session-balance-guide-${index}`}>
              <line
                x1="58"
                y1={guide.y}
                x2="902"
                y2={guide.y}
                stroke={index === chart.yGuides.length - 1 ? "rgba(148,163,184,0.65)" : "rgba(100,116,139,0.28)"}
                strokeWidth="1"
              />
              <text x="50" y={guide.y + 4} textAnchor="end" fontSize="11" fill="rgba(148,163,184,0.9)">
                {guide.label}
              </text>
            </g>
          ))}

          <line x1="58" y1="16" x2="58" y2="258" stroke="rgba(148,163,184,0.65)" strokeWidth="1" />

          <path d={chart.areaPath} fill="url(#session-balance-fill)" />
          <path d={chart.linePath} fill="none" stroke="rgba(229,231,235,0.9)" strokeWidth="2" />

          {chart.points.map((point, index) => (
            <g
              key={`session-balance-point-${index}`}
              onMouseEnter={() => setHoveredPoint(point)}
              onMouseMove={() => setHoveredPoint(point)}
              onPointerDown={() => setHoveredPoint(point)}
            >
              <circle cx={point.x} cy={point.y} r="8" fill="transparent" style={{ cursor: "crosshair" }} />
              <circle
                cx={point.x}
                cy={point.y}
                r={hoveredPoint?.date === point.date ? "3.4" : "2.2"}
                fill="rgba(229,231,235,0.95)"
                stroke="rgba(15,23,42,0.85)"
                strokeWidth="1"
              />
            </g>
          ))}

          {hoveredPoint && (
            <g transform={`translate(${tooltipX}, ${tooltipY})`} pointerEvents="none">
              <line
                x1="0"
                y1={300 - tooltipY - 42}
                x2="0"
                y2={300 - tooltipY - 10}
                stroke="rgba(148,163,184,0.45)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <rect
                x={-96}
                y={-46}
                width={192}
                height={38}
                rx={10}
                fill="rgba(8,18,30,0.96)"
                stroke="rgba(46,92,138,0.85)"
                strokeWidth="1"
              />
              <text x="0" y={-31} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(248,250,252,0.95)">
                {formatSessionBalanceChartDate(hoveredPoint.date, locale)}
              </text>
              <text x="0" y={-17} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(147,197,253,0.98)">
                {formatCurrency(hoveredPoint.balance, locale)}
              </text>
            </g>
          )}

          {chart.xLabels.map((label, index) => (
            <text
              key={`session-balance-x-${index}`}
              x={label.x}
              y="278"
              textAnchor={label.anchor}
              fontSize="11"
              fill="rgba(148,163,184,0.9)"
            >
              {label.label}
            </text>
          ))}

          <text x="14" y="150" textAnchor="middle" fontSize="11" fill="rgba(148,163,184,0.9)" transform="rotate(-90 14 150)">
            Balance
          </text>
          <text x="480" y="294" textAnchor="middle" fontSize="11" fill="rgba(148,163,184,0.9)">
            Date
          </text>
        </svg>
      </div>
    </div>
  );
}

function formatSessionBalanceChartDate(dateValue: string, locale: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function buildSessionOverviewMetrics(trades: NormalizedSessionTrade[]): SessionOverviewMetrics {
  const winners = trades.filter((trade) => trade.outcome === "win");
  const losers = trades.filter((trade) => trade.outcome === "loss");

  const avgWin = winners.length
    ? winners.reduce((sum, trade) => sum + Math.max(trade.pnl, 0), 0) / winners.length
    : 0;
  const avgLossAbs = losers.length
    ? losers.reduce((sum, trade) => sum + Math.abs(Math.min(trade.pnl, 0)), 0) / losers.length
    : 0;
  const avgWinLossRatio =
    avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? Number.POSITIVE_INFINITY : 0;

  const pnlByDay = new Map<string, number>();
  trades.forEach((trade) => {
    const current = pnlByDay.get(trade.date) ?? 0;
    pnlByDay.set(trade.date, current + trade.pnl);
  });

  let dayWins = 0;
  let dayLosses = 0;
  let bestDayPnl = 0;

  pnlByDay.forEach((dayPnl) => {
    if (dayPnl > 0) dayWins += 1;
    if (dayPnl < 0) dayLosses += 1;
    if (dayPnl > bestDayPnl) bestDayPnl = dayPnl;
  });

  const resolvedDays = dayWins + dayLosses;
  const dayWinRate = resolvedDays > 0 ? (dayWins / resolvedDays) * 100 : 0;

  const grossProfit = trades.reduce((sum, trade) => sum + Math.max(trade.pnl, 0), 0);
  const grossLossAbs = trades.reduce((sum, trade) => sum + Math.abs(Math.min(trade.pnl, 0)), 0);
  const profitFactor =
    grossLossAbs > 0
      ? grossProfit / grossLossAbs
      : grossProfit > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  const bestDayPercentOfProfit = grossProfit > 0 ? (bestDayPnl / grossProfit) * 100 : 0;

  return {
    avgWin,
    avgLossAbs,
    avgWinLossRatio,
    dayWins,
    dayLosses,
    dayWinRate,
    grossProfit,
    grossLossAbs,
    profitFactor,
    bestDayPnl,
    bestDayPercentOfProfit,
  };
}

function buildSessionDailyBalanceSeries(
  sessionRange: SessionCalendarRange,
  trades: NormalizedSessionTrade[],
  startBalance: number
): SessionBalancePoint[] {
  const pnlByDay = new Map<string, number>();
  trades.forEach((trade) => {
    const current = pnlByDay.get(trade.date) ?? 0;
    pnlByDay.set(trade.date, current + trade.pnl);
  });

  const dayKeys = enumerateCalendarDates(sessionRange.start, sessionRange.end);
  if (dayKeys.length === 0) {
    return [{ date: sessionRange.start, balance: startBalance }];
  }

  let cumulativeBalance = startBalance;

  return dayKeys.map((dayKey) => {
    cumulativeBalance += pnlByDay.get(dayKey) ?? 0;
    return {
      date: dayKey,
      balance: cumulativeBalance,
    };
  });
}

function enumerateCalendarDates(start: string, end: string) {
  if (end < start) return [start];

  const dates: string[] = [];
  let cursor = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);

  while (cursor <= endDate && dates.length < 1200) {
    dates.push(toISODate(cursor));
    cursor = addCalendarDays(cursor, 1);
  }

  return dates;
}

function buildSessionBalanceChart(
  series: SessionBalancePoint[],
  locale: string,
  width = 920,
  height = 300
): SessionBalanceChartModel {
  const safeSeries = series.length ? series : [{ date: toISODate(new Date()), balance: 0 }];

  const paddingLeft = 58;
  const paddingRight = 18;
  const paddingTop = 16;
  const paddingBottom = 42;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const balances = safeSeries.map((point) => point.balance);
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);
  const spread = rawMax - rawMin;
  const dynamicPadding = Math.max(12, spread * 0.15);
  const minValue = rawMin - dynamicPadding;
  const maxValue = rawMax + dynamicPadding;
  const valueSpan = Math.max(1, maxValue - minValue);

  const mapX = (index: number) => {
    if (safeSeries.length === 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (safeSeries.length - 1)) * chartWidth;
  };
  const mapY = (value: number) => paddingTop + ((maxValue - value) / valueSpan) * chartHeight;

  const points = safeSeries.map((point, index) => ({
    x: mapX(index),
    y: mapY(point.balance),
    date: point.date,
    balance: point.balance,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const baseY = paddingTop + chartHeight;
  const areaPath = `${linePath} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;

  const yGuideCount = 5;
  const yGuides = Array.from({ length: yGuideCount }, (_, index) => {
    const ratio = index / (yGuideCount - 1);
    const value = maxValue - ratio * (maxValue - minValue);
    return {
      y: mapY(value),
      label: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value),
    };
  });

  const xLabelCount = Math.min(5, safeSeries.length);
  const xIndexSet = new Set<number>();
  for (let i = 0; i < xLabelCount; i += 1) {
    if (xLabelCount === 1) {
      xIndexSet.add(0);
      continue;
    }
    xIndexSet.add(Math.round((i * (safeSeries.length - 1)) / (xLabelCount - 1)));
  }

  const xIndexes = Array.from(xIndexSet.values()).sort((a, b) => a - b);
  const xLabels = xIndexes.map((index, labelPosition) => {
    const point = safeSeries[index];
    const date = new Date(`${point.date}T12:00:00`);

    return {
      x: mapX(index),
      label: new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit" }).format(date),
      anchor:
        labelPosition === 0
          ? ("start" as const)
          : labelPosition === xIndexes.length - 1
            ? ("end" as const)
            : ("middle" as const),
    };
  });

  return {
    linePath,
    areaPath,
    points,
    yGuides,
    xLabels,
  };
}

type SessionCalendarStats = {
  totalTrades: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  pnl: number;
};

type SessionCalendarDay = {
  key: string;
  value: string | null;
  label: number | null;
  isPlaceholder: boolean;
  isInRange: boolean;
  stats: SessionCalendarStats;
};

type SessionDayChartPoint = {
  x: number;
  y: number;
  value: number;
  timestamp: number;
};

type SessionDayPerformanceChart = {
  points: SessionDayChartPoint[];
  positiveAreaPath: string;
  negativeAreaPath: string;
  positiveLinePaths: string[];
  negativeLinePaths: string[];
  zeroY: number;
  verticalGuides: number[];
  axisLabels: Array<{ x: number; label: string; anchor: "start" | "middle" | "end" }>;
};

type SessionCalendarRange = {
  start: string;
  end: string;
};

const SESSION_CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SessionReplayTradeCalendar({
  session,
  trades,
}: {
  session: SessionDetailResponse;
  trades: NormalizedSessionTrade[];
}) {
  const { t, i18n } = useTranslation();
  const calendarRange = useMemo(
    () => getSessionCalendarRange(session),
    [session]
  );
  const [calendarViewDate, setCalendarViewDate] = useState(
    () => new Date(`${calendarRange.start}T12:00:00`)
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [hoveredDayChartPoint, setHoveredDayChartPoint] = useState<SessionDayChartPoint | null>(null);

  const tradesByDate = useMemo(() => {
    const grouped = new Map<string, NormalizedSessionTrade[]>();
    trades.forEach((trade) => {
      const current = grouped.get(trade.date) ?? [];
      grouped.set(trade.date, [...current, trade]);
    });
    return grouped;
  }, [trades]);

  const calendarDays = useMemo(
    () =>
      buildSessionCalendarDays(
        calendarViewDate,
        tradesByDate,
        calendarRange.start,
        calendarRange.end
      ),
    [calendarRange.end, calendarRange.start, calendarViewDate, tradesByDate]
  );

  const selectedDayTrades = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return tradesByDate.get(selectedCalendarDate) ?? [];
  }, [selectedCalendarDate, tradesByDate]);

  const selectedDayChart = useMemo(
    () => buildSessionDayPerformanceChart(selectedDayTrades, selectedCalendarDate),
    [selectedCalendarDate, selectedDayTrades]
  );

  const selectedDaySummary = useMemo(() => {
    const wins = selectedDayTrades.filter((trade) => trade.outcome === "win").length;
    const losses = selectedDayTrades.filter((trade) => trade.outcome === "loss").length;
    const pnl = selectedDayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    return { wins, losses, pnl };
  }, [selectedDayTrades]);

  const selectedDayTradesOrdered = useMemo(
    () =>
      [...selectedDayTrades].sort(
        (a, b) =>
          getSessionTradeTimestamp(a, selectedCalendarDate) -
          getSessionTradeTimestamp(b, selectedCalendarDate)
      ),
    [selectedCalendarDate, selectedDayTrades]
  );

  const minMonthKey = calendarRange.start.slice(0, 7);
  const maxMonthKey = calendarRange.end.slice(0, 7);
  const currentMonthKey = toMonthKey(calendarViewDate);
  const canGoPrevMonth = currentMonthKey > minMonthKey;
  const canGoNextMonth = currentMonthKey < maxMonthKey;

  const canGoPrevDay = Boolean(selectedCalendarDate && selectedCalendarDate > calendarRange.start);
  const canGoNextDay = Boolean(selectedCalendarDate && selectedCalendarDate < calendarRange.end);

  const handleSelectCalendarDate = (date: string) => {
    setSelectedCalendarDate(date);
    setCalendarViewDate(new Date(`${date}T12:00:00`));
  };

  const handleNavigateSelectedDay = (deltaDays: number) => {
    if (!selectedCalendarDate) return;

    const baseDate = new Date(`${selectedCalendarDate}T12:00:00`);
    const nextDate = addCalendarDays(baseDate, deltaDays);
    const nextIsoDate = toISODate(nextDate);

    if (nextIsoDate < calendarRange.start || nextIsoDate > calendarRange.end) {
      return;
    }

    setSelectedCalendarDate(nextIsoDate);
    setCalendarViewDate(new Date(`${nextIsoDate}T12:00:00`));
  };

  const locale = getLocale(i18n.language);

  return (
    <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{t("history.calendar.title")}</p>
          <p className="text-xs text-primary-300">
            {formatSessionCalendarIsoDate(calendarRange.start, i18n.language)} - {" "}
            {formatSessionCalendarIsoDate(calendarRange.end, i18n.language)}
          </p>
        </div>

        {selectedCalendarDate && (
          <button
            type="button"
            onClick={() => setSelectedCalendarDate(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-primary-700/70 bg-primary-950/65 px-2 py-1 text-xs font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
          >
            <ArrowLeftIcon size={12} weight="bold" />
            {t("history.calendar.backToCalendar")}
          </button>
        )}
      </div>

      {selectedCalendarDate ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2 px-1 sm:px-0">
            <button
              type="button"
              onClick={() => handleNavigateSelectedDay(-1)}
              disabled={!canGoPrevDay}
              className={cn(
                "inline-flex items-center gap-1 px-1 py-1 text-xs font-semibold transition",
                canGoPrevDay ? "text-primary-200 hover:text-white" : "cursor-not-allowed text-primary-500/80"
              )}
            >
              <ArrowLeftIcon size={14} weight="bold" />
              {t("history.calendar.prevDay")}
            </button>

            <button
              type="button"
              onClick={() => handleNavigateSelectedDay(1)}
              disabled={!canGoNextDay}
              className={cn(
                "inline-flex items-center gap-1 px-1 py-1 text-xs font-semibold transition",
                canGoNextDay ? "text-primary-200 hover:text-white" : "cursor-not-allowed text-primary-500/80"
              )}
            >
              {t("history.calendar.nextDay")}
              <ArrowRightIcon size={14} weight="bold" />
            </button>
          </div>

          <div className="rounded-2xl border border-[#2E5C8A]/45 bg-[#102238]/70 p-3 sm:p-4">
            <p className="mb-2 text-sm font-semibold text-white sm:text-base">
              {t("history.calendar.dayPerformance", {
                date: formatSessionCalendarIsoDate(selectedCalendarDate, i18n.language),
              })}
            </p>

            <div className="relative">
              <svg
                viewBox="0 0 760 260"
                className="h-44 w-full sm:h-56"
                role="img"
                aria-label="Day performance chart"
                onMouseLeave={() => setHoveredDayChartPoint(null)}
              >
                <defs>
                  <linearGradient id="session-calendar-positive-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(74,222,128,0.65)" />
                    <stop offset="100%" stopColor="rgba(74,222,128,0.08)" />
                  </linearGradient>
                  <linearGradient id="session-calendar-negative-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(248,113,113,0.08)" />
                    <stop offset="100%" stopColor="rgba(248,113,113,0.62)" />
                  </linearGradient>
                </defs>

                <rect x="0" y="0" width="760" height="260" fill="transparent" />

                <line x1="52" y1="218" x2="736" y2="218" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                <line
                  x1="52"
                  y1={selectedDayChart.zeroY}
                  x2="736"
                  y2={selectedDayChart.zeroY}
                  stroke="rgba(148,163,184,0.35)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />

                {selectedDayChart.verticalGuides.map((guideX, index) => (
                  <line
                    key={`session-guide-${index}`}
                    x1={guideX}
                    y1="16"
                    x2={guideX}
                    y2="218"
                    stroke="rgba(100,116,139,0.3)"
                    strokeDasharray="3 4"
                    strokeWidth="1"
                  />
                ))}

                <path d={selectedDayChart.positiveAreaPath} fill="url(#session-calendar-positive-fill)" />
                <path d={selectedDayChart.negativeAreaPath} fill="url(#session-calendar-negative-fill)" />

                {selectedDayChart.positiveLinePaths.map((path, index) => (
                  <path key={`session-positive-line-${index}`} d={path} fill="none" stroke="#4ADE80" strokeWidth="2.5" />
                ))}
                {selectedDayChart.negativeLinePaths.map((path, index) => (
                  <path key={`session-negative-line-${index}`} d={path} fill="none" stroke="#F87171" strokeWidth="2.5" />
                ))}

                {selectedDayChart.points.map((point, index) => (
                  <g
                    key={`session-point-${index}`}
                    onMouseEnter={() => setHoveredDayChartPoint(point)}
                    onMouseMove={() => setHoveredDayChartPoint(point)}
                  >
                    <circle cx={point.x} cy={point.y} r="8" fill="transparent" style={{ cursor: "crosshair" }} />
                    <circle cx={point.x} cy={point.y} r="2.5" fill={point.value >= 0 ? "#4ADE80" : "#F87171"} />
                  </g>
                ))}

                {hoveredDayChartPoint && (
                  <g
                    transform={`translate(${hoveredDayChartPoint.x}, ${Math.max(50, hoveredDayChartPoint.y - 12)})`}
                    pointerEvents="none"
                  >
                    <rect
                      x={-66}
                      y={-44}
                      width={132}
                      height={36}
                      rx={10}
                      fill="rgba(13,27,42,0.96)"
                      stroke="rgba(46,92,138,0.8)"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={-30}
                      textAnchor="middle"
                      fill="rgba(248,250,252,0.95)"
                      fontSize="11"
                      fontWeight="700"
                    >
                      {new Intl.DateTimeFormat(getLocale(i18n.language), {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(hoveredDayChartPoint.timestamp))}
                    </text>
                    <text
                      x={0}
                      y={-16}
                      textAnchor="middle"
                      fill={hoveredDayChartPoint.value >= 0 ? "#86efac" : "#fca5a5"}
                      fontSize="11"
                      fontWeight="700"
                    >
                      {formatSignedCurrency(hoveredDayChartPoint.value, locale)}
                    </text>
                  </g>
                )}

                {selectedDayChart.axisLabels.map((axisLabel, index) => (
                  <text
                    key={`session-axis-${index}`}
                    x={axisLabel.x}
                    y="246"
                    textAnchor={axisLabel.anchor}
                    fill="rgba(248,250,252,0.94)"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {axisLabel.label}
                  </text>
                ))}
              </svg>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2E5C8A]/45 bg-[#102238]/70 p-3 sm:p-4">
            <p className="text-lg font-semibold text-white sm:text-xl">
              {t("history.calendar.trades", { count: selectedDayTradesOrdered.length })}
            </p>

            {selectedDayTradesOrdered.length === 0 ? (
              <p className="mt-4 text-sm text-primary-300">{t("history.calendar.noTrades")}</p>
            ) : (
              <div className="mt-4 w-full overflow-x-auto rounded-xl border border-[#2E5C8A]/40">
                <table className="w-full min-w-full border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-[#13273d] text-primary-200">
                    <tr>
                      <th className="px-3 py-2">{t("history.calendar.table.id")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.symbol")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.size")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.entryTime")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.exitTime")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.duration")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.entryPrice")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.exitPrice")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.pnl")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.commissions")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.fees")}</th>
                      <th className="px-3 py-2">{t("history.calendar.table.direction")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDayTradesOrdered.map((trade) => {
                      const tradeDurationMs = getSessionTradeDurationMs(trade);
                      const directionLabel = trade.side
                        ? trade.side.charAt(0).toUpperCase() + trade.side.slice(1)
                        : "--";

                      return (
                        <tr key={trade.id} className="border-t border-[#2E5C8A]/35 bg-[#0F2133]/70">
                          <td className="px-3 py-2 text-primary-100">{trade.id.slice(0, 10)}...</td>
                          <td className="px-3 py-2 text-white">{trade.symbol}</td>
                          <td className="px-3 py-2 text-primary-100">
                            {trade.quantity !== null ? trade.quantity : "--"}
                          </td>
                          <td className="px-3 py-2 text-primary-100">
                            {formatSessionCalendarDateTime(trade.openedAt, i18n.language)}
                          </td>
                          <td className="px-3 py-2 text-primary-100">
                            {formatSessionCalendarDateTime(trade.closedAt, i18n.language)}
                          </td>
                          <td className="px-3 py-2 text-primary-100">
                            {tradeDurationMs !== null ? formatDurationMs(tradeDurationMs) : "--"}
                          </td>
                          <td className="px-3 py-2 text-primary-100">
                            {trade.entryPrice !== null ? formatCurrency(trade.entryPrice, locale) : "--"}
                          </td>
                          <td className="px-3 py-2 text-primary-100">
                            {trade.exitPrice !== null ? formatCurrency(trade.exitPrice, locale) : "--"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 font-semibold",
                              trade.pnl >= 0 ? "text-green-300" : "text-red-300"
                            )}
                          >
                            {formatSignedCurrency(trade.pnl, locale)}
                          </td>
                          <td className="px-3 py-2 text-red-300">--</td>
                          <td className="px-3 py-2 text-red-300">--</td>
                          <td className="px-3 py-2 text-primary-100">{directionLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm text-primary-100">
                {t("history.calendar.trades", { count: selectedDayTrades.length })}
              </div>
              <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm text-green-300">
                {t("history.calendar.wins", { count: selectedDaySummary.wins })}
              </div>
              <div
                className={cn(
                  "rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm",
                  selectedDaySummary.pnl >= 0 ? "text-green-300" : "text-red-300"
                )}
              >
                {t("history.summary.totalPnl")}: {formatSignedCurrency(selectedDaySummary.pnl, locale)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-[#2E5C8A]/45 bg-linear-to-b from-[#17324f] to-[#13273d] p-2 sm:gap-3 sm:px-3 sm:py-2">
            <button
              type="button"
              onClick={() => setCalendarViewDate((prev) => addCalendarMonths(prev, -1))}
              disabled={!canGoPrevMonth}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-xl border px-2 text-[11px] font-semibold transition sm:h-auto sm:min-w-0 sm:px-3 sm:py-1.5 sm:text-xs",
                canGoPrevMonth
                  ? "border-[#2E5C8A]/70 bg-[#102238]/80 text-primary-100 hover:border-[#4C87BA]/75 hover:text-white"
                  : "cursor-not-allowed border-primary-800/40 bg-primary-950/70 text-primary-500/70"
              )}
            >
              {t("history.calendar.prev")}
            </button>
            <p className="rounded-xl border border-[#2E5C8A]/40 bg-[#102238]/65 px-3 py-1 text-xs font-semibold text-white sm:text-sm">
              {formatSessionCalendarMonthYear(calendarViewDate, i18n.language)}
            </p>
            <button
              type="button"
              onClick={() => setCalendarViewDate((prev) => addCalendarMonths(prev, 1))}
              disabled={!canGoNextMonth}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-xl border px-2 text-[11px] font-semibold transition sm:h-auto sm:min-w-0 sm:px-3 sm:py-1.5 sm:text-xs",
                canGoNextMonth
                  ? "border-[#2E5C8A]/70 bg-[#102238]/80 text-primary-100 hover:border-[#4C87BA]/75 hover:text-white"
                  : "cursor-not-allowed border-primary-800/40 bg-primary-950/70 text-primary-500/70"
              )}
            >
              {t("history.calendar.next")}
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 rounded-xl border border-[#2E5C8A]/25 bg-[#102238]/55 px-1.5 py-1 text-center text-[9px] uppercase tracking-[0.12em] text-primary-300 sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-[10px] sm:tracking-[0.2em]">
            {SESSION_CALENDAR_WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-[#2E5C8A]/25 sm:gap-2 sm:rounded-none sm:bg-transparent">
            {calendarDays.map((day) => {
              if (day.isPlaceholder || !day.value || !day.label) {
                return (
                  <div
                    key={day.key}
                    className="min-h-24 bg-[#102238]/35 sm:min-h-28 sm:rounded-2xl sm:border sm:border-[#2E5C8A]/15"
                    aria-hidden
                  />
                );
              }

              const dayValue = day.value;

              if (!day.isInRange) {
                return (
                  <button
                    key={day.key}
                    type="button"
                    disabled
                    className="relative flex min-h-24 cursor-not-allowed flex-col overflow-hidden bg-primary-950/60 p-1 text-left opacity-80 sm:min-h-28 sm:rounded-2xl sm:border sm:border-primary-800/30 sm:p-2"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-900/65 text-[10px] font-semibold text-primary-300 sm:h-6 sm:w-6 sm:text-xs">
                      {day.label}
                    </span>
                  </button>
                );
              }

              const hasTrades = day.stats.totalTrades > 0;
              const isPositiveDay = day.stats.pnl > 0;
              const isNegativeDay = day.stats.pnl < 0;

              const dayContainerClass = !hasTrades
                ? "bg-zinc-700/80"
                : isPositiveDay
                  ? "bg-emerald-700/45"
                  : isNegativeDay
                    ? "bg-red-700/45"
                    : "bg-zinc-700/80";

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handleSelectCalendarDate(dayValue)}
                  className="group relative flex min-h-24 flex-col overflow-hidden bg-[#142a40]/75 p-0 text-left transition-colors duration-200 hover:bg-[#17324f]/80 sm:min-h-28 sm:rounded-2xl sm:border sm:border-[#2E5C8A]/40 sm:hover:border-[#4C87BA]/75"
                >
                  <div className={cn("flex h-full w-full flex-1 flex-col p-1 transition duration-200 group-hover:brightness-110 sm:rounded-[15px] sm:p-2", dayContainerClass)}>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/30 text-[10px] font-semibold text-white sm:h-6 sm:w-6 sm:text-xs">
                      {day.label}
                    </span>

                    {hasTrades && (
                      <div className="flex flex-1 flex-col items-center justify-center gap-0.5 text-center sm:gap-1">
                        <p
                          className={cn(
                            "text-[11px] font-extrabold leading-none sm:text-xl",
                            isPositiveDay
                              ? "text-emerald-200"
                              : isNegativeDay
                                ? "text-rose-200"
                                : "text-zinc-100"
                          )}
                        >
                          <span className="sm:hidden">{formatSessionCalendarCellPnl(day.stats.pnl, locale)}</span>
                          <span className="hidden sm:inline">{formatSignedCurrency(day.stats.pnl, locale)}</span>
                        </p>
                        <p className="text-[9px] font-medium text-zinc-300 sm:hidden">{day.stats.totalTrades}</p>
                        <p className="hidden text-xs font-medium text-zinc-300 sm:block">
                          {t("history.calendar.trades", { count: day.stats.totalTrades })}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function buildSessionCalendarDays(
  viewDate: Date,
  tradesByDate: Map<string, NormalizedSessionTrade[]>,
  rangeStart: string,
  rangeEnd: string
) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const monthDays = lastDay.getDate();
  const totalCells = Math.ceil((startOffset + monthDays) / 7) * 7;
  const days: SessionCalendarDay[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - startOffset + 1;
    const isPlaceholder = dayNumber < 1 || dayNumber > monthDays;

    if (isPlaceholder) {
      days.push({
        key: `session-empty-${year}-${month}-${index}`,
        value: null,
        label: null,
        isPlaceholder: true,
        isInRange: false,
        stats: {
          totalTrades: 0,
          resolvedTrades: 0,
          wins: 0,
          losses: 0,
          pnl: 0,
        },
      });
      continue;
    }

    const date = new Date(year, month, dayNumber);
    const value = toISODate(date);
    const isInRange = value >= rangeStart && value <= rangeEnd;
    const trades = isInRange ? tradesByDate.get(value) ?? [] : [];
    const wins = trades.filter((trade) => trade.outcome === "win").length;
    const losses = trades.filter((trade) => trade.outcome === "loss").length;
    const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);

    days.push({
      key: `${value}-${index}`,
      value,
      label: dayNumber,
      isPlaceholder: false,
      isInRange,
      stats: {
        totalTrades: trades.length,
        resolvedTrades: wins + losses,
        wins,
        losses,
        pnl,
      },
    });
  }

  return days;
}

function buildSessionDayPerformanceChart(
  trades: NormalizedSessionTrade[],
  selectedDate: string | null,
  width = 760,
  height = 260
): SessionDayPerformanceChart {
  const paddingLeft = 52;
  const paddingRight = 24;
  const paddingTop = 16;
  const paddingBottom = 42;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const safeDate = selectedDate || toISODate(new Date());
  const dayStart = new Date(`${safeDate}T00:00:00`).getTime();
  const dayEnd = new Date(`${safeDate}T23:59:59`).getTime();

  const orderedTrades = [...trades].sort(
    (a, b) =>
      getSessionTradeTimestamp(a, selectedDate) -
      getSessionTradeTimestamp(b, selectedDate)
  );

  const timeline: Array<{ timestamp: number; value: number }> = [{ timestamp: dayStart, value: 0 }];
  let cumulative = 0;

  orderedTrades.forEach((trade) => {
    cumulative += trade.pnl;
    timeline.push({
      timestamp: Math.min(Math.max(getSessionTradeTimestamp(trade, selectedDate), dayStart), dayEnd),
      value: cumulative,
    });
  });

  timeline.push({ timestamp: dayEnd, value: cumulative });

  const values = timeline.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = Math.max(1, maxValue - minValue);

  const mapX = (timestamp: number) =>
    paddingLeft + ((timestamp - dayStart) / Math.max(1, dayEnd - dayStart)) * chartWidth;
  const mapY = (value: number) => paddingTop + ((maxValue - value) / span) * chartHeight;
  const zeroY = mapY(0);

  const points = timeline.map((point) => ({
    x: mapX(point.timestamp),
    y: mapY(point.value),
    value: point.value,
    timestamp: point.timestamp,
  }));

  const positivePoints = points.map((point) => ({ x: point.x, y: Math.min(point.y, zeroY) }));
  const negativePoints = points.map((point) => ({ x: point.x, y: Math.max(point.y, zeroY) }));

  const positiveAreaPath = sessionAreaPathFromPoints(positivePoints, zeroY);
  const negativeAreaPath = sessionAreaPathFromPoints(negativePoints, zeroY);
  const signedLinePaths = buildSessionSignedLinePaths(points, zeroY);

  const guideCount = 3;
  const verticalGuides = Array.from({ length: guideCount }, (_, index) => {
    const ratio = (index + 1) / (guideCount + 1);
    return paddingLeft + chartWidth * ratio;
  });

  const midTimestamp = dayStart + (dayEnd - dayStart) * 0.5;
  const axisLabels = [
    { x: paddingLeft, label: formatClock(dayStart), anchor: "start" as const },
    { x: mapX(midTimestamp), label: formatClock(midTimestamp), anchor: "middle" as const },
    { x: paddingLeft + chartWidth, label: formatClock(dayEnd), anchor: "end" as const },
  ];

  return {
    points,
    positiveAreaPath,
    negativeAreaPath,
    positiveLinePaths: signedLinePaths.positive,
    negativeLinePaths: signedLinePaths.negative,
    zeroY,
    verticalGuides,
    axisLabels,
  };
}

function buildSessionSignedLinePaths(points: SessionDayChartPoint[], zeroY: number) {
  const positiveSegments: Array<Array<{ x: number; y: number }>> = [];
  const negativeSegments: Array<Array<{ x: number; y: number }>> = [];

  if (points.length < 2) {
    return { positive: [] as string[], negative: [] as string[] };
  }

  let currentSign: "positive" | "negative" = points[0].value >= 0 ? "positive" : "negative";
  let currentSegment: Array<{ x: number; y: number }> = [{ x: points[0].x, y: points[0].y }];

  const flushCurrent = () => {
    if (currentSegment.length < 2) {
      currentSegment = [];
      return;
    }

    if (currentSign === "positive") {
      positiveSegments.push(currentSegment);
    } else {
      negativeSegments.push(currentSegment);
    }

    currentSegment = [];
  };

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    const nextSign: "positive" | "negative" = next.value >= 0 ? "positive" : "negative";

    if (nextSign === currentSign) {
      currentSegment.push({ x: next.x, y: next.y });
      continue;
    }

    const denominator = prev.value - next.value;
    const t = denominator === 0 ? 0 : prev.value / denominator;
    const clampedT = Math.max(0, Math.min(1, t));
    const crossingX = prev.x + (next.x - prev.x) * clampedT;
    const crossingPoint = { x: crossingX, y: zeroY };

    currentSegment.push(crossingPoint);
    flushCurrent();

    currentSign = nextSign;
    currentSegment = [crossingPoint, { x: next.x, y: next.y }];
  }

  flushCurrent();

  return {
    positive: positiveSegments.map((segment) => sessionLinePathFromPoints(segment)),
    negative: negativeSegments.map((segment) => sessionLinePathFromPoints(segment)),
  };
}

function sessionLinePathFromPoints(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function sessionAreaPathFromPoints(points: Array<{ x: number; y: number }>, baseY: number) {
  if (points.length === 0) return "";

  const line = sessionLinePathFromPoints(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

function getSessionTradeTimestamp(trade: NormalizedSessionTrade, selectedDate: string | null) {
  const source = trade.openedAt || trade.closedAt || `${selectedDate || trade.date}T12:00:00`;
  const timestamp = new Date(source).getTime();
  if (!Number.isNaN(timestamp)) return timestamp;
  return new Date(`${trade.date}T12:00:00`).getTime();
}

function getSessionTradeDurationMs(trade: NormalizedSessionTrade) {
  if (!trade.openedAt || !trade.closedAt) return null;
  const openTimestamp = new Date(trade.openedAt).getTime();
  const closeTimestamp = new Date(trade.closedAt).getTime();
  if (Number.isNaN(openTimestamp) || Number.isNaN(closeTimestamp)) return null;
  if (closeTimestamp < openTimestamp) return null;
  return closeTimestamp - openTimestamp;
}

function getSessionCalendarRange(session: SessionDetailResponse | null): SessionCalendarRange {
  if (!session) {
    const today = toISODate(new Date());
    return { start: today, end: today };
  }

  const startCandidate =
    toCalendarIsoDate(session.startDate) ||
    toCalendarIsoDate(session.startedAt) ||
    toISODate(new Date());

  const endCandidate =
    toCalendarIsoDate(session.endDate) ||
    toCalendarIsoDate(session.endedAt) ||
    toISODate(new Date());

  if (endCandidate < startCandidate) {
    return { start: startCandidate, end: startCandidate };
  }

  return {
    start: startCandidate,
    end: endCandidate,
  };
}

function addISODateDays(value: string, delta: number) {
  const date = new Date(`${value}T12:00:00`);
  return toISODate(addCalendarDays(date, delta));
}

function clampIsoDate(value: string, min: string, max: string) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function isSameCalendarRange(a: SessionCalendarRange, b: SessionCalendarRange) {
  return a.start === b.start && a.end === b.end;
}

function formatSessionStatsRange(start: string, end: string, language: string) {
  const locale = getLocale(language);
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function toCalendarIsoDate(value: string | null | undefined) {
  if (!value) return null;

  const directMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (directMatch) {
    return directMatch[0];
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return toISODate(parsedDate);
}

function addCalendarMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function addCalendarDays(date: Date, delta: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatSessionCalendarMonthYear(date: Date, language: string) {
  const locale = getLocale(language);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function formatSessionCalendarIsoDate(value: string, language: string) {
  const locale = getLocale(language);
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date);
}

function formatSessionCalendarDateTime(value: string | null | undefined, language: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat(getLocale(language), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDurationMs(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatClock(timestamp: number) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeSessionTrade(
  trade: SessionTradeSummary,
  session: SessionDetailResponse
): NormalizedSessionTrade | null {
  const openedAt = toValidTimestamp(trade.openedAt);
  const closedAt = toValidTimestamp(trade.closedAt);
  const fallbackTimestamp =
    toValidTimestamp(session.startedAt) ??
    toValidTimestamp(session.startDate) ??
    Date.now();

  const timestamp = openedAt ?? closedAt ?? fallbackTimestamp;
  const date = toISODate(new Date(timestamp));
  const pnl = Number.isFinite(Number(trade.netPnl)) ? Number(trade.netPnl) : 0;

  const normalizedPerformance = (trade.performance || "").toLowerCase();
  const normalizedStatus = (trade.status || "").toLowerCase();

  let outcome: NormalizedSessionTrade["outcome"] = "breakeven";
  if (normalizedPerformance === "open" || normalizedStatus === "open") {
    outcome = "open";
  } else if (normalizedPerformance === "win" || pnl > 0) {
    outcome = "win";
  } else if (normalizedPerformance === "loss" || pnl < 0) {
    outcome = "loss";
  }

  const side =
    trade.side === "buy" || trade.side === "sell" ? trade.side : undefined;

  const symbol = normalizeTradeSymbol((trade as SessionTradeSummary & { symbol?: string }).symbol, session.marketSymbol);
  const quantity = toFiniteNumber(trade.quantity);
  const entryPrice = toFiniteNumber(trade.entryPrice);
  const exitPrice = toFiniteNumber(trade.exitPrice);

  const durationMs =
    openedAt !== null && closedAt !== null && closedAt >= openedAt
      ? closedAt - openedAt
      : null;

  return {
    id: trade.id,
    date,
    pnl,
    outcome,
    side,
    durationMs,
    timestamp,
    symbol,
    openedAt: trade.openedAt ?? null,
    closedAt: trade.closedAt ?? null,
    quantity,
    entryPrice,
    exitPrice,
  };
}

function normalizeTradeSymbol(symbol: string | undefined, fallback: string | undefined) {
  const fromTrade = (symbol || "").trim().toUpperCase();
  if (fromTrade) return fromTrade;
  return (fallback || "--").trim().toUpperCase() || "--";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function buildConsecutiveStats(
  trades: NormalizedSessionTrade[],
  targetOutcome: "win" | "loss"
): { max: number | null; avg: number | null } {
  if (!trades.length) {
    return { max: null, avg: null };
  }

  const streaks: number[] = [];
  let current = 0;

  trades.forEach((trade) => {
    if (trade.outcome === targetOutcome) {
      current += 1;
      return;
    }

    if (current > 0) {
      streaks.push(current);
      current = 0;
    }
  });

  if (current > 0) {
    streaks.push(current);
  }

  if (!streaks.length) {
    return { max: null, avg: null };
  }

  const max = Math.max(...streaks);
  const avg = streaks.reduce((acc, value) => acc + value, 0) / streaks.length;

  return {
    max,
    avg: Math.round(avg * 10) / 10,
  };
}

function averageDuration(trades: NormalizedSessionTrade[]): number | null {
  const durations = trades
    .map((trade) => trade.durationMs)
    .filter((duration): duration is number => typeof duration === "number");

  if (!durations.length) return null;
  return durations.reduce((acc, value) => acc + value, 0) / durations.length;
}

function toValidTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number, locale: string) {
  const absFormatted = formatCurrency(Math.abs(value), locale);
  if (value < 0) return `-${absFormatted}`;
  return absFormatted;
}

function formatSessionCalendarCellPnl(value: number, locale: string) {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    const compact = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(absValue);
    return `${value < 0 ? "-" : ""}$${compact}`;
  }

  return formatSignedCurrency(value, locale);
}

function getLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}
