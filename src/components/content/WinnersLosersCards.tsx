"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/classNames";
import type { HistoryOutcomeCardsSummaryViewModel } from "@/lib/types/history";
import { Info as InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

type WinnersLosersCardsProps = {
  outcomeCards?: HistoryOutcomeCardsSummaryViewModel | null;
  isLoading?: boolean;
};

export function WinnersLosersCards({ outcomeCards, isLoading = false }: WinnersLosersCardsProps) {
  const { t, i18n } = useTranslation();
  const locale = getLocale(i18n.language);

  const metrics = {
    totalWinners: outcomeCards?.winners.total ?? null,
    bestWin: outcomeCards?.winners.bestPnl ?? null,
    averageWin: outcomeCards?.winners.averagePnl ?? null,
    averageWinDurationMs: outcomeCards?.winners.averageDurationMs ?? null,
    maxConsecutiveWins: outcomeCards?.winners.maxConsecutive ?? null,
    avgConsecutiveWins: outcomeCards?.winners.avgConsecutive ?? null,

    totalLosers: outcomeCards?.losers.total ?? null,
    worstLoss: outcomeCards?.losers.worstPnl ?? null,
    averageLoss: outcomeCards?.losers.averagePnl ?? null,
    averageLossDurationMs: outcomeCards?.losers.averageDurationMs ?? null,
    maxConsecutiveLosses: outcomeCards?.losers.maxConsecutive ?? null,
    avgConsecutiveLosses: outcomeCards?.losers.avgConsecutive ?? null,
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={`outcome-card-skeleton-${index}`}
            className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          >
            <Skeleton className="h-6 w-24 rounded" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 6 }).map((__, row) => (
                <div key={`outcome-card-skeleton-${index}-${row}`} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-28 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <OutcomeCard
        variant="win"
        title={t("history.outcomeCards.winners.title")}
        rows={[
          {
            label: t("history.outcomeCards.winners.totalWinners"),
            value: formatMaybeNumber(metrics.totalWinners),
          },
          {
            label: t("history.outcomeCards.winners.bestWin"),
            value: formatMaybeCurrency(metrics.bestWin, locale),
          },
          {
            label: t("history.outcomeCards.winners.averageWin"),
            value: formatMaybeCurrency(metrics.averageWin, locale),
          },
          {
            label: t("history.outcomeCards.winners.averageDuration"),
            value: formatDuration(metrics.averageWinDurationMs),
          },
          {
            label: t("history.outcomeCards.winners.maxConsecutiveWins"),
            value: formatMaybeNumber(metrics.maxConsecutiveWins),
          },
          {
            label: t("history.outcomeCards.winners.avgConsecutiveWins"),
            value: formatMaybeNumber(metrics.avgConsecutiveWins),
          },
        ]}
      />

      <OutcomeCard
        variant="loss"
        title={t("history.outcomeCards.losers.title")}
        rows={[
          {
            label: t("history.outcomeCards.losers.totalLosers"),
            value: formatMaybeNumber(metrics.totalLosers),
          },
          {
            label: t("history.outcomeCards.losers.worstLoss"),
            value: formatMaybeCurrency(metrics.worstLoss, locale),
          },
          {
            label: t("history.outcomeCards.losers.averageLoss"),
            value: formatMaybeCurrency(metrics.averageLoss, locale),
          },
          {
            label: t("history.outcomeCards.losers.averageDuration"),
            value: formatDuration(metrics.averageLossDurationMs),
          },
          {
            label: t("history.outcomeCards.losers.maxConsecutiveLosses"),
            value: formatMaybeNumber(metrics.maxConsecutiveLosses),
          },
          {
            label: t("history.outcomeCards.losers.avgConsecutiveLosses"),
            value: formatMaybeNumber(metrics.avgConsecutiveLosses),
          },
        ]}
      />
    </div>
  );
}

type OutcomeCardRow = {
  label: string;
  value: string;
};

type OutcomeCardProps = {
  variant: "win" | "loss";
  title: string;
  rows: OutcomeCardRow[];
};

function OutcomeCard({ variant, title, rows }: OutcomeCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
        variant === "win"
          ? "border border-emerald-500/45"
          : "border border-red-500/45"
      )}
    >
      <h3 className="text-lg font-semibold text-white">{title}</h3>

      <div className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 text-sm text-primary-200">
              <span>{row.label}</span>
              <InfoIcon size={12} className="text-primary-500" weight="fill" aria-hidden />
            </div>
            <span className="text-sm font-semibold text-white">{row.value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatMaybeCurrency(value: number | null, locale: string) {
  if (value === null) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMaybeNumber(value: number | null) {
  if (value === null) return "-";
  return Number.isInteger(value) ? `${value}` : `${value.toFixed(1)}`;
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "-";

  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}
