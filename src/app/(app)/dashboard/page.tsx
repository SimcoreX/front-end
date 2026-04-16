"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { DatePicker } from "@/components/forms/DatePicker";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { TradesBySymbolChart } from "@/components/charts/TradesBySymbolChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { getHistoryTrades } from "@/lib/api/history";
import { getMarketSymbols } from "@/lib/api/reference";
import { getSessionAnalytics } from "@/lib/api/trades";
import { createSession } from "@/lib/api/trades";
import { cn } from "@/lib/classNames";
import { isApiError } from "@/lib/types/api";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import type { FocusEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { HistoryTradeItemResponse } from "@/lib/types/history";
import type { MarketSymbolItem } from "@/lib/types/reference";
import type {
  DashboardOverviewResponse,
  DashboardWeekdayKey,
  HistoricalTimeSummary,
} from "@/lib/types/dashboard";
import { Plus as PlusIcon } from "@phosphor-icons/react";

type DashboardViewData = {
  summary: {
    timeInvestedMinutes: number;
    overallWinRate: number;
    totalTrades: number;
    completedSessions: number;
    historyCount: number;
    historicalTime: HistoricalTimeSummary;
  };
  pnlSeries: number[];
  marketSeries: number[];
  tradingDaysByMonth: number[];
  tradesBySymbol: number[];
  winRateByMonth: number[];
  labelsMonthly: string[];
  labelsTradingDays: string[];
  labelsSymbols: string[];
  labelsWinRate: string[];
  updatedAt: string;
  source: "live" | "mock";
};

type TradingDaysChartData = {
  monthKeys: string[];
  values: number[];
};

type TradesBySymbolChartData = {
  labels: string[];
  values: number[];
};

type WinRateMonthlyChartData = {
  monthKeys: string[];
  values: number[];
};

type TradesTakenSummary = {
  totalTrades: number;
  buyPercentage: number;
  sellPercentage: number;
  buyTrades: number;
  sellTrades: number;
};

type MarketOption = {
  value: string;
  symbol: string;
  market: string;
  description: string;
};

type NewSessionForm = {
  name: string;
  accountBalance: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
};

const WEEKDAY_KEYS: DashboardWeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIMEFRAME_OPTIONS = ["M1", "M5", "M15"].map((timeframe) => ({
  value: timeframe,
  label: timeframe,
}));

export default function DashboardPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const fallbackOverview = useMemo(() => buildFallbackOverview(), []);
  const fallbackTradingDays = useMemo(() => getTradingDaysChartFallback(), []);
  const fallbackTradesBySymbol = useMemo(() => getTradesBySymbolFallback(), []);
  const fallbackWinRate = useMemo(() => getWinRateMonthlyChartFallback(), []);
  const [dashboard, setDashboard] = useState<DashboardViewData>(() =>
    mapOverviewToView(
      fallbackOverview,
      i18n.language,
      "mock",
      fallbackTradingDays,
      fallbackTradesBySymbol,
      fallbackWinRate
    )
  );
  const [tradesTakenSummary, setTradesTakenSummary] = useState<TradesTakenSummary>(() =>
    getTradesTakenFallback()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [hasTradesTakenError, setHasTradesTakenError] = useState(false);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [endDatePickerAnchorDate, setEndDatePickerAnchorDate] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);
  const [marketOptions, setMarketOptions] = useState<MarketOption[]>([]);
  const [isLoadingMarketOptions, setIsLoadingMarketOptions] = useState(false);
  const [hasMarketOptionsError, setHasMarketOptionsError] = useState(false);
  const [form, setForm] = useState<NewSessionForm>({
    name: "",
    accountBalance: formatUsdAmount(100000),
    symbol: "",
    timeframe: "M5",
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
  });

  useEffect(() => {
    let cancelled = false;

    const loadOverview = async () => {
      setIsLoading(true);
      setHasError(false);
      setHasTradesTakenError(false);

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { from: winRateFrom, to: winRateTo } = getLastSixMonthsDateRange();
      const [overviewResult, tradesTakenResult, tradingDaysResult, tradesBySymbolResult, winRateResult] =
        await Promise.allSettled([
          getDashboardOverview({ timezone }),
          getHistoryTrades({ page: 1, pageSize: 1 }),
          getTradingDaysChartForLastSixMonths(),
          getSessionAnalytics({ timezone }),
          getSessionAnalytics({ timezone, from: winRateFrom, to: winRateTo }),
        ]);

      if (cancelled) return;

      const tradingDaysChart =
        tradingDaysResult.status === "fulfilled"
          ? tradingDaysResult.value
          : getTradingDaysChartFallback();

      const tradesBySymbolChart =
        tradesBySymbolResult.status === "fulfilled"
          ? normalizeTradesBySymbolChart(tradesBySymbolResult.value.charts?.tradesBySymbol)
          : getTradesBySymbolFallback();

      const winRateMonthlyChart =
        winRateResult.status === "fulfilled"
          ? normalizeWinRateMonthlyChart(winRateResult.value.charts?.successByMonth)
          : getWinRateMonthlyChartFallback();

      if (overviewResult.status === "fulfilled") {
        setDashboard(
          mapOverviewToView(
            overviewResult.value,
            i18n.language,
            "live",
            tradingDaysChart,
            tradesBySymbolChart,
            winRateMonthlyChart
          )
        );
      } else {
        setDashboard(
          mapOverviewToView(
            fallbackOverview,
            i18n.language,
            "mock",
            tradingDaysChart,
            tradesBySymbolChart,
            winRateMonthlyChart
          )
        );
        setHasError(true);
      }

      if (tradesTakenResult.status === "fulfilled") {
        setTradesTakenSummary(normalizeTradesTakenSummary(tradesTakenResult.value.summary));
      } else {
        setTradesTakenSummary(getTradesTakenFallback());
        setHasTradesTakenError(true);
      }

      setIsLoading(false);
    };

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [fallbackOverview, i18n.language]);

  useEffect(() => {
    let cancelled = false;

    const loadMarketSymbols = async () => {
      setIsLoadingMarketOptions(true);
      setHasMarketOptionsError(false);

      try {
        const response = await getMarketSymbols();
        if (cancelled) return;

        const options = (response.data ?? [])
          .filter((item) => item.active)
          .map(normalizeMarketOption);

        setMarketOptions(options);
        setForm((prev) => ({
          ...prev,
          symbol: prev.symbol || options[0]?.value || "",
        }));
      } catch {
        if (cancelled) return;
        setMarketOptions([]);
        setHasMarketOptionsError(true);
      } finally {
        if (!cancelled) {
          setIsLoadingMarketOptions(false);
        }
      }
    };

    loadMarketSymbols();

    return () => {
      cancelled = true;
    };
  }, []);

  const marketSelectOptions = useMemo(
    () =>
      marketOptions.map((option) => ({
        value: option.value,
        label: `${option.symbol} • ${option.market}`,
      })),
    [marketOptions]
  );

  const resetForm = () => {
    setForm({
      name: "",
      accountBalance: formatUsdAmount(100000),
      symbol: marketOptions[0]?.value || "",
      timeframe: "M5",
      startDate: getDefaultStartDate(),
      endDate: getDefaultEndDate(),
    });
  };

  const handleOpenModal = () => {
    setStatusMessage(null);
    setStatusType(null);
    setIsStartDatePickerOpen(false);
    setIsEndDatePickerOpen(false);
    setEndDatePickerAnchorDate(null);
    setIsNewSessionModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsNewSessionModalOpen(false);
    setIsStartDatePickerOpen(false);
    setIsEndDatePickerOpen(false);
    setEndDatePickerAnchorDate(null);
    resetForm();
  };

  const handleAccountBalanceFocus = (event: FocusEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      accountBalance: toEditableUsdInput(prev.accountBalance),
    }));

    const inputElement = event.currentTarget;
    window.requestAnimationFrame(() => {
      inputElement.select();
    });
  };

  const handleAccountBalanceBlur = () => {
    setForm((prev) => {
      const trimmedValue = prev.accountBalance.trim();
      if (!trimmedValue) {
        return {
          ...prev,
          accountBalance: "",
        };
      }

      return {
        ...prev,
        accountBalance: formatUsdCurrencyInput(trimmedValue),
      };
    });
  };

  const handleCreateSession = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationName"));
      return;
    }

    if (!form.timeframe.trim()) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationTimeframe"));
      return;
    }

    const parsedBalance = parseUsdCurrencyInput(form.accountBalance);
    if (parsedBalance === null || parsedBalance < 0) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationBalance"));
      return;
    }

    if (!form.startDate || !form.endDate) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationDates"));
      return;
    }

    if (!form.symbol.trim()) {
      setStatusType("error");
      setStatusMessage(t("trades.apiErrors.symbolRequired"));
      return;
    }

    const startDateIso = normalizeSessionDateForCreate(form.startDate, "start");
    if (!startDateIso) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationStartDate"));
      return;
    }

    const endDateIso = normalizeSessionDateForCreate(form.endDate, "end");
    if (!endDateIso) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationEndDate"));
      return;
    }

    if (new Date(endDateIso).getTime() < new Date(startDateIso).getTime()) {
      setStatusType("error");
      setStatusMessage(t("trades.newSession.validationDateRange"));
      return;
    }

    setIsCreatingSession(true);

    try {
      const requestedTimeframe = normalizeTimeframe(form.timeframe);

      const created = await createSession({
        name: trimmedName,
        marketSymbol: form.symbol.trim().toUpperCase(),
        timeframe: requestedTimeframe,
        startDate: startDateIso,
        endDate: endDateIso,
        accountBalanceStart: roundToTwoDecimals(parsedBalance),
      });

      setStatusType("success");
      setStatusMessage(t("trades.newSession.created"));
      setIsNewSessionModalOpen(false);
      resetForm();

      const params = new URLSearchParams({
        openReplay: "1",
        sessionId: created.id,
        sessionName: created.name,
        balance: String(roundToTwoDecimals(parsedBalance)),
        symbol: created.marketSymbol || form.symbol,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      router.push(`/trades?${params.toString()}`);
    } catch (error) {
      setStatusType("error");
      if (isApiError(error)) {
        if (error.code === "INVALID_SESSION_DATES") {
          setStatusMessage(t("trades.apiErrors.invalidSessionDates"));
        } else if (error.code === "FORBIDDEN_CREATE_SESSION") {
          setStatusMessage(t("trades.apiErrors.forbiddenCreateSession"));
        } else if (error.statusCode === 400) {
          setStatusMessage(t("trades.apiErrors.invalidCreatePayload"));
        } else {
          setStatusMessage(t("trades.apiErrors.createSessionFailed"));
        }
      } else {
        setStatusMessage(t("trades.apiErrors.requestFailed"));
      }
    } finally {
      setIsCreatingSession(false);
    }
  };

  const cards = [
    {
      title: t("dashboard.charts.tradesPnl"),
      type: "bar" as const,
      data: dashboard.pnlSeries,
      labels: dashboard.labelsMonthly,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.marketTracker"),
      type: "bar" as const,
      data: dashboard.marketSeries,
      labels: dashboard.labelsMonthly,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.tradingDays"),
      type: "bar" as const,
      data: dashboard.tradingDaysByMonth,
      labels: dashboard.labelsTradingDays,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.tradesBySymbol"),
      type: "horizontal-bar" as const,
      data: dashboard.tradesBySymbol,
      labels: dashboard.labelsSymbols,
      color: "#2E5C8A",
    },
    {
      title: t("dashboard.charts.winRate"),
      type: "bar" as const,
      data: dashboard.winRateByMonth,
      labels: dashboard.labelsWinRate,
      color: "#2E5C8A",
      valueSuffix: "%",
      yAxisTicks: [0, 20, 40, 60, 80, 100],
      forceMax: 100,
      barGradient: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{t("dashboard.title")}</PageTitle>
        <Button type="button" variant="light" className="min-w-40" onClick={handleOpenModal}>
          <span className="inline-flex items-center gap-2">
            <PlusIcon size={16} weight="bold" />
            {t("trades.newSession.button")}
          </span>
        </Button>
      </div>
      {hasError && (
        <p className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {t("dashboard.errors.loadFailed")}
        </p>
      )}

      {statusMessage && (
        <p className={cn("text-sm", statusType === "success" ? "text-green-400" : "text-red-400")}>
          {statusMessage}
        </p>
      )}

      {isLoading && <DashboardSkeleton />}

      {!isLoading && (
        <>
          <SummaryCards
            items={[
              {
                label: t("dashboard.summary.overallWinRate"),
                value: hasError ? "-" : formatOverallWinRate(dashboard.summary.overallWinRate),
                hint: hasError
                  ? t("dashboard.summary.overallWinRateError")
                  : t("dashboard.summary.overallWinRateHint"),
              },
              {
                label: t("dashboard.summary.tradesTaken"),
                value: hasTradesTakenError ? "-" : `${tradesTakenSummary.totalTrades}`,
                hint: hasTradesTakenError
                  ? t("dashboard.summary.tradesTakenError")
                  : t("dashboard.summary.buySellRatio", {
                      buy: formatPercentagePtBr(tradesTakenSummary.buyPercentage),
                      sell: formatPercentagePtBr(tradesTakenSummary.sellPercentage),
                    }),
              },
              {
                label: t("dashboard.summary.historicalTime"),
                value: formatHistoricalTime(dashboard.summary.historicalTime),
                hint: t("dashboard.summary.basedOnSessions", {
                  count: dashboard.summary.historicalTime.sessionCount,
                }),
              },
              {
                label: t("dashboard.summary.timeInvested"),
                value: formatDurationFromMinutes(dashboard.summary.timeInvestedMinutes),
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
                valueSuffix={card.valueSuffix}
                yAxisTicks={card.yAxisTicks}
                forceMax={card.forceMax}
                barGradient={card.barGradient}
              />
            ))}
          </div>
        </>
      )}

      {isNewSessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-[1px] sm:items-center sm:p-5">
          <div className="mx-auto flex w-full max-w-2xl flex-col rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="mb-4">
              <p className="text-lg font-semibold text-white">{t("trades.newSession.title")}</p>
              <p className="text-sm text-primary-200">{t("trades.newSession.description")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label={t("trades.newSession.fields.name")}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={t("trades.newSession.fields.namePlaceholder")}
              />
              <TextField
                label={t("trades.newSession.fields.accountBalance")}
                type="text"
                inputMode="decimal"
                value={form.accountBalance}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    accountBalance: formatUsdInputWhileTyping(event.target.value),
                  }))
                }
                onFocus={handleAccountBalanceFocus}
                onBlur={handleAccountBalanceBlur}
                placeholder="$100,000.00"
              />
              <SelectField
                label={t("trades.newSession.fields.market")}
                value={form.symbol}
                options={marketSelectOptions}
                disabled={isLoadingMarketOptions || marketSelectOptions.length === 0}
                onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value }))}
              />
              <SelectField
                label={t("trades.newSession.fields.timeframe")}
                value={form.timeframe}
                options={TIMEFRAME_OPTIONS}
                onChange={(event) => setForm((prev) => ({ ...prev, timeframe: event.target.value }))}
              />

              {hasMarketOptionsError && (
                <p className="text-xs text-red-300">{t("trades.apiErrors.requestFailed")}</p>
              )}

              <DatePicker
                label={t("trades.newSession.fields.startDate")}
                value={form.startDate}
                isOpen={isStartDatePickerOpen}
                onOpenChange={(nextIsOpen) => {
                  setIsStartDatePickerOpen(nextIsOpen);
                  if (nextIsOpen) {
                    setIsEndDatePickerOpen(false);
                  }
                }}
                onChange={(event) => {
                  const nextStartDate = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    startDate: nextStartDate,
                    endDate: prev.endDate < nextStartDate ? nextStartDate : prev.endDate,
                  }));
                  setEndDatePickerAnchorDate(nextStartDate);
                  setIsStartDatePickerOpen(false);
                  window.setTimeout(() => {
                    setIsEndDatePickerOpen(true);
                  }, 0);
                }}
              />
              <DatePicker
                label={t("trades.newSession.fields.endDate")}
                value={form.endDate}
                isOpen={isEndDatePickerOpen}
                onOpenChange={(nextIsOpen) => {
                  setIsEndDatePickerOpen(nextIsOpen);
                  if (nextIsOpen) {
                    setIsStartDatePickerOpen(false);
                  }
                  if (!nextIsOpen) {
                    setEndDatePickerAnchorDate(null);
                  }
                }}
                openToDate={endDatePickerAnchorDate ?? undefined}
                onChange={(event) => {
                  const nextEndDate = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    endDate: nextEndDate < prev.startDate ? prev.startDate : nextEndDate,
                  }));
                  setEndDatePickerAnchorDate(null);
                  setIsEndDatePickerOpen(false);
                }}
              />
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleCloseModal}>
                {t("trades.newSession.actions.cancel")}
              </Button>
              <Button type="button" variant="light" onClick={handleCreateSession}>
                {isCreatingSession ? t("trades.newSession.actions.creating") : t("trades.newSession.actions.create")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
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
        {Array.from({ length: 5 }).map((_, index) => (
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
      overallWinRate: 0,
      totalTrades: 0,
      completedSessions: 0,
      historyCount: 0,
      historicalTime: getHistoricalTimeFallback(),
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
  source: "live" | "mock",
  tradingDaysChart: TradingDaysChartData,
  tradesBySymbolChart: TradesBySymbolChartData,
  winRateMonthlyChart: WinRateMonthlyChartData
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

  return {
    summary: {
      ...overview.summary,
      overallWinRate: normalizeOverallWinRate(overview.summary.overallWinRate),
      historyCount: overview.summary.historyCount ?? overview.summary.totalTrades,
      historicalTime: normalizeHistoricalTime(overview.summary.historicalTime),
    },
    pnlSeries: months.map((month) => pnlByMonth.get(month) ?? 0),
    marketSeries: months.map((month) => marketByMonth.get(month) ?? 0),
    tradingDaysByMonth: tradingDaysChart.values,
    tradesBySymbol: tradesBySymbolChart.values,
    winRateByMonth: winRateMonthlyChart.values,
    labelsMonthly: months.map((month) => formatMonthLabel(month, language)),
    labelsTradingDays: tradingDaysChart.monthKeys.map((month) => formatMonthLabel(month, language)),
    labelsSymbols: tradesBySymbolChart.labels,
    labelsWinRate: winRateMonthlyChart.monthKeys.map((month) => formatMonthLabel(month, language)),
    updatedAt: overview.updatedAt,
    source,
  };
}

function getWinRateMonthlyChartFallback(): WinRateMonthlyChartData {
  const monthKeys = getLastMonthKeys(6);
  return {
    monthKeys,
    values: monthKeys.map(() => 0),
  };
}

function normalizeWinRateMonthlyChart(
  points: Array<{ month: string; value: number }> | undefined
): WinRateMonthlyChartData {
  const fallback = getWinRateMonthlyChartFallback();
  const byMonth = new Map((points ?? []).map((point) => [point.month, Number(point.value)]));

  return {
    monthKeys: fallback.monthKeys,
    values: fallback.monthKeys.map((monthKey) => {
      const value = Number(byMonth.get(monthKey));
      if (!Number.isFinite(value)) return 0;
      return Math.min(100, Math.max(0, value));
    }),
  };
}

function normalizeMarketOption(item: MarketSymbolItem): MarketOption {
  return {
    value: item.symbol,
    symbol: item.symbol,
    market: item.market,
    description: item.label,
  };
}

function normalizeTimeframe(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "5MIN" || normalized === "M5") return "M5";
  if (normalized === "15MIN" || normalized === "M15") return "M15";
  if (normalized === "1MIN" || normalized === "M1") return "M1";
  return normalized;
}

function normalizeSessionDateForCreate(value: string, boundary: "start" | "end") {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  if (trimmedValue.includes("T")) {
    const parsedDateTime = new Date(trimmedValue);
    if (Number.isNaN(parsedDateTime.getTime())) return null;
    return parsedDateTime.toISOString();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return null;
  }

  const utcDate =
    boundary === "start"
      ? `${trimmedValue}T00:00:00.000Z`
      : `${trimmedValue}T23:59:59.999Z`;
  const parsedDate = new Date(utcDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function parseUsdCurrencyInput(value: string): number | null {
  const sanitized = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "").replace(/\.$/, "");
  if (!sanitized) return null;

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUsdCurrencyInput(value: string): string {
  const parsed = parseUsdCurrencyInput(value);
  if (parsed === null) return "";

  return formatUsdAmount(parsed);
}

function toEditableUsdInput(value: string): string {
  const parsed = parseUsdCurrencyInput(value);
  if (parsed === null) return "";
  return formatUsdInputWhileTyping(parsed.toFixed(2));
}

function formatUsdInputWhileTyping(value: string): string {
  let normalized = value.replace(/[^0-9.,]/g, "");
  if (!normalized) return "";
  if (normalized === "." || normalized === ",") return "0.";

  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot) {
    normalized = normalized.replace(/,/g, "");
    const hasTrailingDot = normalized.endsWith(".");
    const [integerPartRaw, ...decimalParts] = normalized.split(".");
    const integerPart = addThousandsSeparators(integerPartRaw.replace(/\D/g, ""));
    const decimals = decimalParts.join("").replace(/\D/g, "").slice(0, 2);

    if (hasTrailingDot && decimals.length === 0) {
      return `${integerPart}.`;
    }

    if (decimals.length > 0) {
      return `${integerPart}.${decimals}`;
    }

    return integerPart;
  }

  if (hasComma) {
    const lastCommaIndex = normalized.lastIndexOf(",");
    const integerRaw = normalized.slice(0, lastCommaIndex).replace(/\D/g, "");
    const decimalRaw = normalized.slice(lastCommaIndex + 1).replace(/\D/g, "");

    // Comma with up to 2 trailing digits is treated as decimal separator for typed inputs.
    if (decimalRaw.length <= 2) {
      const integerPart = addThousandsSeparators(integerRaw);
      if (normalized.endsWith(",") && decimalRaw.length === 0) {
        return `${integerPart}.`;
      }

      if (decimalRaw.length > 0) {
        return `${integerPart}.${decimalRaw}`;
      }

      return integerPart;
    }

    return addThousandsSeparators(normalized.replace(/\D/g, ""));
  }

  return addThousandsSeparators(normalized.replace(/\D/g, ""));
}

function addThousandsSeparators(digits: string): string {
  const normalizedDigits = digits.replace(/^0+(?=\d)/, "") || "0";
  return normalizedDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatUsdAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getDefaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return toISODate(date);
}

function getDefaultEndDate() {
  return toISODate(new Date());
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTradingDaysChartFallback(): TradingDaysChartData {
  const monthKeys = getLastMonthKeys(6);
  return {
    monthKeys,
    values: monthKeys.map(() => 0),
  };
}

async function getTradingDaysChartForLastSixMonths(): Promise<TradingDaysChartData> {
  const fallback = getTradingDaysChartFallback();
  const monthKeys = fallback.monthKeys;
  const { from, to } = getLastSixMonthsDateRange();
  const pageSize = 200;

  const daysByMonth = new Map<string, Set<string>>(
    monthKeys.map((monthKey) => [monthKey, new Set<string>()])
  );

  let page = 1;
  while (true) {
    const response = await getHistoryTrades({ page, pageSize, from, to });

    if (!response.data.length) {
      break;
    }

    for (const trade of response.data) {
      registerTradeDay(daysByMonth, trade);
    }

    if (!response.hasNextPage) {
      break;
    }

    page += 1;
  }

  return {
    monthKeys,
    values: monthKeys.map((monthKey) => daysByMonth.get(monthKey)?.size ?? 0),
  };
}

function registerTradeDay(daysByMonth: Map<string, Set<string>>, trade: HistoryTradeItemResponse) {
  const referenceDate = trade.closedAt ?? trade.openedAt ?? trade.createdAt;
  if (!referenceDate) return;

  const parsedDate = new Date(referenceDate);
  if (Number.isNaN(parsedDate.getTime())) return;

  const monthKey = toMonthKey(parsedDate);
  const monthBucket = daysByMonth.get(monthKey);
  if (!monthBucket) return;

  const dayKey = `${monthKey}-${String(parsedDate.getUTCDate()).padStart(2, "0")}`;
  monthBucket.add(dayKey);
}

function getLastSixMonthsDateRange(referenceDate = new Date()) {
  const from = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 5, 1, 0, 0, 0, 0)
  );

  return {
    from: from.toISOString(),
    to: referenceDate.toISOString(),
  };
}

function getLastMonthKeys(monthCount: number, referenceDate = new Date()) {
  return Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - (monthCount - 1 - index), 1)
    );

    return toMonthKey(monthDate);
  });
}

function toMonthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getTradesBySymbolFallback(): TradesBySymbolChartData {
  return {
    labels: ["--"],
    values: [0],
  };
}

function normalizeTradesBySymbolChart(
  points: Array<{
    symbol: string;
    value: number;
  }> | undefined
): TradesBySymbolChartData {
  const normalizedPoints = (points ?? [])
    .map((point) => ({
      symbol: point.symbol?.trim().toUpperCase() || "",
      value: Number(point.value),
    }))
    .filter((point) => point.symbol && Number.isFinite(point.value) && point.value > 0)
    .slice(0, 6);

  if (!normalizedPoints.length) {
    return getTradesBySymbolFallback();
  }

  return {
    labels: normalizedPoints.map((point) => point.symbol),
    values: normalizedPoints.map((point) => point.value),
  };
}

function getTradesTakenFallback(): TradesTakenSummary {
  return {
    totalTrades: 0,
    buyPercentage: 0,
    sellPercentage: 0,
    buyTrades: 0,
    sellTrades: 0,
  };
}

function normalizeTradesTakenSummary(summary: {
  totalTrades?: number;
  buyTrades?: number;
  sellTrades?: number;
  buyPercentage?: number;
  sellPercentage?: number;
} | undefined): TradesTakenSummary {
  const fallback = getTradesTakenFallback();
  if (!summary) return fallback;

  const totalTrades = Number(summary.totalTrades);
  const buyPercentage = Number(summary.buyPercentage);
  const sellPercentage = Number(summary.sellPercentage);
  const buyTrades = Number(summary.buyTrades);
  const sellTrades = Number(summary.sellTrades);

  return {
    totalTrades: Number.isFinite(totalTrades) ? totalTrades : fallback.totalTrades,
    buyPercentage: Number.isFinite(buyPercentage) ? buyPercentage : fallback.buyPercentage,
    sellPercentage: Number.isFinite(sellPercentage) ? sellPercentage : fallback.sellPercentage,
    buyTrades: Number.isFinite(buyTrades) ? buyTrades : fallback.buyTrades,
    sellTrades: Number.isFinite(sellTrades) ? sellTrades : fallback.sellTrades,
  };
}

function normalizeOverallWinRate(overallWinRate: number | undefined): number {
  const normalizedValue = Number(overallWinRate);
  if (!Number.isFinite(normalizedValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, normalizedValue));
}

function formatOverallWinRate(overallWinRate: number): string {
  return formatPercentagePtBr(overallWinRate);
}

function formatPercentagePtBr(value: number): string {
  const hasDecimal = !Number.isInteger(value);
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);

  return `${formatted}%`;
}

function getHistoricalTimeFallback(): HistoricalTimeSummary {
  return {
    years: 0,
    months: 0,
    days: 0,
    label: "0yr 0mo 0d",
    sessionCount: 0,
  };
}

function normalizeHistoricalTime(historicalTime: HistoricalTimeSummary | undefined): HistoricalTimeSummary {
  if (!historicalTime) {
    return getHistoricalTimeFallback();
  }

  return {
    years: Number.isFinite(historicalTime.years) ? historicalTime.years : 0,
    months: Number.isFinite(historicalTime.months) ? historicalTime.months : 0,
    days: Number.isFinite(historicalTime.days) ? historicalTime.days : 0,
    label: historicalTime.label?.trim() || "0yr 0mo 0d",
    sessionCount: Number.isFinite(historicalTime.sessionCount) ? historicalTime.sessionCount : 0,
  };
}

function formatHistoricalTime(historicalTime: HistoricalTimeSummary): ReactNode {
  return (
    <span className="inline-flex items-baseline gap-2">
      <DurationValue value={historicalTime.years} unit="yr" />
      <DurationValue value={historicalTime.months} unit="mo" />
      <DurationValue value={historicalTime.days} unit="d" />
    </span>
  );
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

function formatDurationFromMinutes(totalMinutes: number): ReactNode {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const minutesPerDay = 24 * 60;
  const days = Math.floor(safeMinutes / minutesPerDay);
  const hours = Math.floor((safeMinutes % minutesPerDay) / 60);
  const minutes = safeMinutes % 60;
  return (
    <span className="inline-flex items-baseline gap-2">
      <DurationValue value={days} unit="d" />
      <DurationValue value={hours} unit="hr" />
      <DurationValue value={minutes} unit="min" />
    </span>
  );
}

function DurationValue({ value, unit }: { value: number; unit: string }) {
  return (
    <span>
      <span>{value}</span>
      <span className="ml-1 text-[0.68em] font-medium opacity-85">{unit}</span>
    </span>
  );
}

function toLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}

type SummaryItem = {
  label: string;
  value: ReactNode;
  hint: string;
};

function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
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
  type: "line" | "bar" | "horizontal-bar";
  valueSuffix?: string;
  yAxisTicks?: number[];
  forceMax?: number;
  barGradient?: boolean;
};

function ChartCard({ title, data, labels, color, type, valueSuffix, yAxisTicks, forceMax, barGradient }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-primary-800/70 bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <p className="text-lg font-semibold text-white">{title}</p>

      <div className="mt-4 h-56">
        {type === "line" ? (
          <LineChart data={data} color={color} labels={labels} />
        ) : type === "horizontal-bar" ? (
          <TradesBySymbolChart data={data} labels={labels} valueSuffix={valueSuffix} />
        ) : (
          <BarChart
            data={data}
            color={color}
            labels={labels}
            valueSuffix={valueSuffix}
            yAxisTicks={yAxisTicks}
            forceMax={forceMax}
            barGradient={barGradient}
          />
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

type BarChartProps = BaseChartProps & {
  valueSuffix?: string;
  yAxisTicks?: number[];
  forceMax?: number;
  barGradient?: boolean;
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

function BarChart({ data, labels, color, valueSuffix, yAxisTicks, forceMax, barGradient }: BarChartProps) {
  const computedMax = forceMax ?? Math.max(...data, 0);
  const max = Math.max(1, computedMax);
  const min = 0;
  const yRange = max === min ? 1 : max - min;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const hasAxis = Boolean(yAxisTicks?.length);
  const axisOffset = hasAxis ? 36 : 0;
  const animationSeed = useMemo(
    () => `${labels.join("|")}::${data.join("|")}::${valueSuffix ?? ""}::${String(forceMax ?? "")}`,
    [data, forceMax, labels, valueSuffix]
  );

  useEffect(() => {
    setIsAnimated(false);
    const frame = window.requestAnimationFrame(() => {
      setIsAnimated(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [animationSeed]);

  const formatValue = (value: number) => {
    if (valueSuffix === "%") {
      return formatPercentagePtBr(value);
    }
    if (valueSuffix) {
      return `${value}${valueSuffix}`;
    }
    return `${value}`;
  };

  return (
    <div className="relative h-full w-full">
      <div className="relative h-52">
        {hasAxis && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 border-l border-primary-700/60"
              style={{ left: `${axisOffset}px` }}
            />
            <div className="pointer-events-none absolute inset-0">
              {yAxisTicks?.map((tick) => {
                const normalized = Math.max(0, Math.min(1, (tick - min) / yRange));
                return (
                  <div
                    key={`winrate-axis-${tick}`}
                    className="absolute right-0 border-t border-dashed border-primary-700/50"
                    style={{
                      left: `${axisOffset}px`,
                      bottom: `${normalized * 100}%`,
                    }}
                  >
                    <span className="absolute -left-8 -translate-y-1/2 text-[10px] text-primary-300">
                      {valueSuffix ? `${tick}${valueSuffix}` : `${tick}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className={cn("flex h-full items-end gap-2", hasAxis ? "pl-10 pr-2" : "px-2")}>
        {data.map((value, idx) => {
          const safeValue = Math.max(min, Math.min(value, max));
          const barHeightPercent = ((safeValue - min) / yRange) * 100;
          const isHover = hoverIdx === idx;
          const tone = getBlueScaleColor(idx, data.length);
          return (
            <div
              key={`${value}-${idx}`}
              className={cn(
                "flex-1 rounded-t-lg border border-primary-800/70 bg-primary-950/70",
                isHover && "border-white/70"
              )}
              style={{
                height: `${barHeightPercent}%`,
                backgroundColor: `${tone}22`,
                borderColor: isHover ? "#ffffffb3" : `${tone}44`,
              }}
              aria-label={`${labels[idx]}: ${formatValue(value)}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div
                className="h-full w-full rounded-t-lg"
                style={
                  barGradient
                    ? {
                        transformOrigin: "bottom",
                        transform: isAnimated ? "scaleY(1)" : "scaleY(0)",
                        transition: `transform 640ms cubic-bezier(0.2, 0.9, 0.2, 1) ${idx * 45}ms, opacity 220ms ease`,
                        backgroundImage: `linear-gradient(to top, ${tone}AA 0%, ${tone}D8 58%, rgba(196,230,255,0.92) 100%)`,
                        opacity: isHover ? 1 : 0.93,
                        boxShadow: isHover
                          ? `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 14px ${tone}66`
                          : "inset 0 1px 0 rgba(255,255,255,0.32)",
                      }
                    : {
                        transformOrigin: "bottom",
                        transform: isAnimated ? "scaleY(1)" : "scaleY(0)",
                        transition: `transform 640ms cubic-bezier(0.2, 0.9, 0.2, 1) ${idx * 45}ms, opacity 220ms ease`,
                        backgroundImage: `linear-gradient(to top, ${tone}9F 0%, ${tone}CF 62%, rgba(193,228,255,0.85) 100%)`,
                        opacity: isHover ? 0.98 : 0.88,
                        boxShadow: isHover ? `0 0 12px ${tone}4D` : "none",
                      }
                }
              />
            </div>
          );
        })}
        </div>
      </div>

      {hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-10 left-0 flex w-full justify-center">
          <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <div className="font-semibold text-white">{labels[hoverIdx]}</div>
            <div className="text-primary-100">{formatValue(data[hoverIdx])}</div>
          </div>
        </div>
      )}

      <div className={cn("mt-2 flex justify-between text-[10px] text-primary-300", hasAxis ? "pl-10 pr-2" : "px-2")}>
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

const BLUE_SCALE = ["#1F3D63", "#25537F", "#2E5C8A", "#3A71A2", "#4C87BA", "#63A1D3"];

function getBlueScaleColor(index: number, total: number) {
  if (total <= 1) return BLUE_SCALE[2];
  const position = index / (total - 1);
  const paletteIndex = Math.min(
    BLUE_SCALE.length - 1,
    Math.round(position * (BLUE_SCALE.length - 1))
  );
  return BLUE_SCALE[paletteIndex];
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
