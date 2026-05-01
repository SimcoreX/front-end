"use client";

import { PnlDetailsPanel, type PnlPanelTrade } from "@/components/content/PnlDetailsPanel";
import { WinnersLosersCards } from "@/components/content/WinnersLosersCards";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/classNames";
import type { HistoryOutcomeCardsSummaryViewModel } from "@/lib/types/history";
import type { SessionDetailResponse, SessionTradeSummary } from "@/lib/types/trades";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type NormalizedSessionTrade = {
  id: string;
  date: string;
  pnl: number;
  outcome: "win" | "loss" | "open" | "breakeven";
  side?: "buy" | "sell";
  durationMs: number | null;
  timestamp: number;
};

export function SessionReplayStatsPanel({
  session,
  isLoading,
}: {
  session: SessionDetailResponse | null;
  isLoading: boolean;
}) {
  const { t, i18n } = useTranslation();

  const normalizedTrades = useMemo<NormalizedSessionTrade[]>(() => {
    if (!session?.trades?.length) return [];

    return session.trades
      .map((trade) => normalizeSessionTrade(trade, session))
      .filter((trade): trade is NormalizedSessionTrade => Boolean(trade))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [session]);

  const totalTrades = Number.isFinite(Number(session?.totalTrades))
    ? Number(session?.totalTrades)
    : normalizedTrades.length;
  const wins = Number.isFinite(Number(session?.wins))
    ? Number(session?.wins)
    : normalizedTrades.filter((trade) => trade.outcome === "win").length;
  const losses = Number.isFinite(Number(session?.losses))
    ? Number(session?.losses)
    : normalizedTrades.filter((trade) => trade.outcome === "loss").length;
  const resolvedTrades = wins + losses;
  const successRate =
    resolvedTrades > 0
      ? Math.round((wins / resolvedTrades) * 10000) / 100
      : Number.isFinite(Number(session?.winRate))
        ? Number(session?.winRate)
        : 0;

  const netPnl = Number.isFinite(Number(session?.netPnl))
    ? Number(session?.netPnl)
    : normalizedTrades.reduce((acc, trade) => acc + trade.pnl, 0);

  const startBalance = Number.isFinite(Number(session?.accountBalanceStart))
    ? Number(session?.accountBalanceStart)
    : 0;
  const currentBalance =
    session?.accountBalanceEnd === null || session?.accountBalanceEnd === undefined
      ? startBalance + netPnl
      : Number(session.accountBalanceEnd);

  const pnlPanelTrades = useMemo<PnlPanelTrade[]>(
    () =>
      normalizedTrades.map((trade) => ({
        id: trade.id,
        date: trade.date,
        pnl: trade.pnl,
        outcome: trade.outcome,
      })),
    [normalizedTrades]
  );

  const sideSummary = useMemo(() => {
    const base = {
      buy: { count: 0, pnl: 0 },
      sell: { count: 0, pnl: 0 },
    };

    normalizedTrades.forEach((trade) => {
      if (trade.side !== "buy" && trade.side !== "sell") return;
      base[trade.side].count += 1;
      base[trade.side].pnl += trade.pnl;
    });

    return base;
  }, [normalizedTrades]);

  const outcomeCards = useMemo<HistoryOutcomeCardsSummaryViewModel>(() => {
    const winners = normalizedTrades.filter((trade) => trade.outcome === "win");
    const losers = normalizedTrades.filter((trade) => trade.outcome === "loss");

    const winnerConsecutive = buildConsecutiveStats(normalizedTrades, "win");
    const loserConsecutive = buildConsecutiveStats(normalizedTrades, "loss");

    return {
      winners: {
        total: winners.length,
        bestPnl: winners.length ? Math.max(...winners.map((trade) => trade.pnl)) : null,
        worstPnl: winners.length ? Math.min(...winners.map((trade) => trade.pnl)) : null,
        averagePnl: winners.length
          ? winners.reduce((acc, trade) => acc + trade.pnl, 0) / winners.length
          : null,
        averageDurationMs: averageDuration(winners),
        maxConsecutive: winnerConsecutive.max,
        avgConsecutive: winnerConsecutive.avg,
      },
      losers: {
        total: losers.length,
        bestPnl: losers.length ? Math.max(...losers.map((trade) => trade.pnl)) : null,
        worstPnl: losers.length ? Math.min(...losers.map((trade) => trade.pnl)) : null,
        averagePnl: losers.length
          ? losers.reduce((acc, trade) => acc + trade.pnl, 0) / losers.length
          : null,
        averageDurationMs: averageDuration(losers),
        maxConsecutive: loserConsecutive.max,
        avgConsecutive: loserConsecutive.avg,
      },
    };
  }, [normalizedTrades]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <Skeleton className="h-6 w-40 rounded" />
          <Skeleton className="mt-2 h-4 w-72 rounded" />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`session-stats-summary-skeleton-${index}`} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-60 w-full rounded-2xl" />
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

  const locale = getLocale(i18n.language);
  const hasDetailedTrades = normalizedTrades.length > 0;

  return (
    <div className="space-y-5 text-sm text-primary-100">
      <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-white">{t("trades.replay.sessionStats.title")}</p>
          <p className="text-primary-200">{t("trades.replay.sessionStats.description")}</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label={t("trades.replay.sessionStats.startBalance")}
            value={formatCurrency(startBalance, locale)}
          />
          <MetricCard
            label={t("trades.replay.sessionStats.currentBalance")}
            value={formatCurrency(currentBalance, locale)}
          />
          <MetricCard
            label={t("trades.replay.sessionStats.netPnl")}
            value={formatSignedCurrency(netPnl, locale)}
            tone={netPnl >= 0 ? "positive" : "negative"}
          />
          <MetricCard
            label={t("trades.replay.sessionStats.totalTrades")}
            value={String(totalTrades)}
          />
          <MetricCard
            label={t("trades.replay.sessionStats.winsLosses")}
            value={`${wins} / ${losses}`}
          />
          <MetricCard
            label={t("trades.replay.sessionStats.successRate")}
            value={`${successRate.toFixed(2)}%`}
            tone={successRate >= 50 ? "positive" : "negative"}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <p className="text-base font-semibold text-white">{t("trades.replay.sessionStats.sidePerformance")}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <SideCard
            title={t("trades.replay.sessionStats.buy")}
            count={sideSummary.buy.count}
            pnl={sideSummary.buy.pnl}
            locale={locale}
            tone="positive"
            countLabel={t("trades.replay.sessionStats.count")}
            pnlLabel={t("trades.replay.sessionStats.pnl")}
          />
          <SideCard
            title={t("trades.replay.sessionStats.sell")}
            count={sideSummary.sell.count}
            pnl={sideSummary.sell.pnl}
            locale={locale}
            tone="negative"
            countLabel={t("trades.replay.sessionStats.count")}
            pnlLabel={t("trades.replay.sessionStats.pnl")}
          />
        </div>
      </div>

      {hasDetailedTrades ? (
        <>
          <PnlDetailsPanel trades={pnlPanelTrades} initialBalance={startBalance} />
          <WinnersLosersCards outcomeCards={outcomeCards} />
        </>
      ) : (
        <div className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <p className="text-sm text-primary-200">{t("trades.replay.sessionStats.noDetailedTrades")}</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl border border-primary-800/60 bg-primary-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-primary-300">{label}</p>
      <p
        className={cn(
          "mt-1 text-base font-semibold text-white",
          tone === "positive" && "text-green-400",
          tone === "negative" && "text-red-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SideCard({
  title,
  count,
  pnl,
  locale,
  tone,
  countLabel,
  pnlLabel,
}: {
  title: string;
  count: number;
  pnl: number;
  locale: string;
  tone: "positive" | "negative";
  countLabel: string;
  pnlLabel: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "positive" ? "border-emerald-500/45" : "border-red-500/45"
      )}
    >
      <p className="text-base font-semibold text-white">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <MetricCard label={countLabel} value={String(count)} />
        <MetricCard
          label={pnlLabel}
          value={formatSignedCurrency(pnl, locale)}
          tone={pnl >= 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  );
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
  };
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

function getLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}
