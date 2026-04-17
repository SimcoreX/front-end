"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { DatePicker } from "@/components/forms/DatePicker";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { TradesBySymbolChart } from "@/components/charts/TradesBySymbolChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { getMarketSymbols } from "@/lib/api/reference";
import { completeSession, createSession, getSessionAnalytics, listSessions } from "@/lib/api/trades";
import { cn } from "@/lib/classNames";
import { isApiError } from "@/lib/types/api";
import type { MarketSymbolItem } from "@/lib/types/reference";
import type { SessionAnalyticsResponse, SessionRecordResponse } from "@/lib/types/trades";
import { ArrowLeft as ArrowLeftIcon, Plus as PlusIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

const tabs = [
  { key: "summary", labelKey: "trades.tabs.summary" },
  { key: "sessions", labelKey: "trades.tabs.sessions" },
] as const;

const SESSIONS_PAGE_SIZE = 5;
const TIMEFRAME_OPTIONS = ["M1", "M5", "M15"].map((timeframe) => ({
  value: timeframe,
  label: timeframe,
}));

type MarketOption = {
  value: string;
  symbol: string;
  market: string;
  description: string;
};

type TabKey = (typeof tabs)[number]["key"];

type NewSessionForm = {
  name: string;
  accountBalance: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
};

type ReplaySessionState = {
  sessionId: string;
  sessionName: string;
  accountBalance: number;
  symbol: string;
  startDate: string;
  endDate: string;
};

type SessionSlot = "asia" | "london" | "ny";

type MarketSessionRecord = {
  id: string;
  name: string;
  symbol: string;
  session: SessionSlot;
  status: "active" | "completed";
  startedAt: string;
  endedAt?: string;
  timeframe: string;
  timeInvestedMinutes: number;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  successRate: number;
};

type MarketSummary = SessionAnalyticsResponse["summary"];

export default function TradesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [sessions, setSessions] = useState<MarketSessionRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [hasSessionsError, setHasSessionsError] = useState(false);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsHasNextPage, setSessionsHasNextPage] = useState(false);
  const [summaryData, setSummaryData] = useState<MarketSummary>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    successRate: 0,
    totalPnl: 0,
    timeInvestedMinutes: 0,
    completedSessions: 0,
    activeSessions: 0,
  });
  const [analyticsData, setAnalyticsData] = useState<SessionAnalyticsResponse["charts"]>({
    timeByMonth: [],
    successByMonth: [],
    tradesBySymbol: [],
  });
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [hasAnalyticsError, setHasAnalyticsError] = useState(false);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [activeReplaySession, setActiveReplaySession] = useState<ReplaySessionState | null>(null);
  const [isExitReplayModalOpen, setIsExitReplayModalOpen] = useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [endDatePickerAnchorDate, setEndDatePickerAnchorDate] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
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

    const loadMarketSymbols = async () => {
      setIsLoadingMarketOptions(true);
      setHasMarketOptionsError(false);

      try {
        const response = await getMarketSymbols();
        if (cancelled) return;

        const options = (response.data ?? [])
          .filter((item) => item.active)
          .map((item) => normalizeMarketOption(item));

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

  const loadSessionsData = useCallback(async (page = 1) => {
    setIsLoadingSessions(true);
    setHasSessionsError(false);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await listSessions({
        page,
        limit: SESSIONS_PAGE_SIZE,
        sortBy: "startedAt",
        sortOrder: "desc",
        timezone,
      });
      setSessions((response.data ?? []).map(mapSessionFromApi));
      setSessionsPage(response.page || page);
      setSessionsHasNextPage(Boolean(response.hasNextPage));
    } catch {
      setSessions([]);
      setSessionsPage(1);
      setSessionsHasNextPage(false);
      setHasSessionsError(true);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadSummaryData = useCallback(async () => {
    setIsLoadingAnalytics(true);
    setHasAnalyticsError(false);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await getSessionAnalytics({ timezone });
      setSummaryData(response.summary);
      setAnalyticsData(response.charts);
    } catch {
      setSummaryData({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        successRate: 0,
        totalPnl: 0,
        timeInvestedMinutes: 0,
        completedSessions: 0,
        activeSessions: 0,
      });
      setAnalyticsData({
        timeByMonth: [],
        successByMonth: [],
        tradesBySymbol: [],
      });
      setHasAnalyticsError(true);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    loadSessionsData(1);
    loadSummaryData();
  }, [loadSessionsData, loadSummaryData]);

  useEffect(() => {
    const shouldOpenReplay = searchParams.get("openReplay") === "1";
    const sessionId = searchParams.get("sessionId");
    if (!shouldOpenReplay || !sessionId) return;

    const parsedBalance = Number(searchParams.get("balance"));
    const startDate = searchParams.get("startDate") ?? getDefaultStartDate();
    const endDate = searchParams.get("endDate") ?? getDefaultEndDate();
    const symbol = searchParams.get("symbol") ?? "EURUSD";
    const sessionName = searchParams.get("sessionName") ?? t("trades.newSession.title");

    setActiveReplaySession({
      sessionId,
      sessionName,
      accountBalance: Number.isFinite(parsedBalance) ? parsedBalance : 100000,
      symbol,
      startDate,
      endDate,
    });

    const nextParams = new URLSearchParams(searchParams.toString());
    [
      "openReplay",
      "sessionId",
      "sessionName",
      "balance",
      "symbol",
      "startDate",
      "endDate",
    ].forEach((key) => nextParams.delete(key));

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/trades?${nextQuery}` : "/trades");
  }, [router, searchParams, t]);

  const totalTimeInvested = formatDurationFromMinutes(summaryData.timeInvestedMinutes);

  const charts = useMemo(() => {
    const monthlyTimeMap = new Map(
      (analyticsData.timeByMonth ?? []).map((point) => [point.month, Number(point.value) || 0])
    );
    const monthlySuccessMap = new Map(
      (analyticsData.successByMonth ?? []).map((point) => [point.month, Number(point.value) || 0])
    );

    const monthKeys = Array.from(new Set([...monthlyTimeMap.keys(), ...monthlySuccessMap.keys()])).sort();
    const monthLabels = monthKeys.length
      ? monthKeys.map((month) => formatMonthLabel(month, i18n.language))
      : ["--"];

    const timeByMonth = monthKeys.length
      ? monthKeys.map((month) => monthlyTimeMap.get(month) ?? 0)
      : [0];

    const successByMonth = monthKeys.length
      ? monthKeys.map((month) => monthlySuccessMap.get(month) ?? 0)
      : [0];

    const symbolEntries = (analyticsData.tradesBySymbol ?? []).map((point) => ({
      symbol: point.symbol,
      value: Number(point.value) || 0,
    }));

    const symbolLabels = symbolEntries.length
      ? symbolEntries.map((entry) => formatMarketSymbol(entry.symbol))
      : ["--"];
    const tradesBySymbol = symbolEntries.length
      ? symbolEntries.map((entry) => entry.value)
      : [0];

    return {
      monthLabels,
      timeByMonth,
      successByMonth,
      symbolLabels,
      tradesBySymbol,
    };
  }, [analyticsData, i18n.language]);

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

      await Promise.all([loadSessionsData(1), loadSummaryData()]);
      setStatusType("success");
      setStatusMessage(t("trades.newSession.created"));
      setIsNewSessionModalOpen(false);
      setActiveReplaySession({
        sessionId: created.id,
        sessionName: created.name,
        accountBalance: parsedBalance,
        symbol: created.marketSymbol || form.symbol,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      resetForm();
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

  const handleRequestExitReplay = () => {
    if (!activeReplaySession) return;
    setIsExitReplayModalOpen(true);
  };

  const handleCancelExitReplay = () => {
    setIsExitReplayModalOpen(false);
  };

  const handleConfirmExitReplay = async () => {
    if (!activeReplaySession) return;

    const fallbackEndedAt = `${activeReplaySession.endDate}T23:59:59.000Z`;

    try {
      await completeSession(activeReplaySession.sessionId, {
        accountBalanceEnd: roundToTwoDecimals(activeReplaySession.accountBalance),
        endedAt: fallbackEndedAt,
      });
      await Promise.all([loadSessionsData(1), loadSummaryData()]);
    } catch (error) {
      setStatusType("error");
      if (isApiError(error)) {
        setStatusMessage(t("trades.apiErrors.requestFailed"));
      } else {
        setStatusMessage(t("trades.apiErrors.requestFailed"));
      }
      return;
    }

    setIsExitReplayModalOpen(false);
    setActiveReplaySession(null);
  };

  const chartSymbol = useMemo(() => toTradingViewSymbol(activeReplaySession?.symbol), [activeReplaySession?.symbol]);
  const replayFrom = useMemo(() => toUnixTimestamp(activeReplaySession?.startDate, false), [activeReplaySession?.startDate]);
  const replayTo = useMemo(() => toUnixTimestamp(activeReplaySession?.endDate, true), [activeReplaySession?.endDate]);
  const canGoToPrevSessionsPage = sessionsPage > 1 && !isLoadingSessions;
  const canGoToNextSessionsPage = sessionsHasNextPage && !isLoadingSessions;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("nav.trades")}</PageTitle>

      <div className="overflow-hidden rounded-2xl bg-primary-900/50 shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
        <div className="flex gap-3 bg-primary-900/50 px-3 pt-3">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 pb-2 text-sm font-semibold transition",
                  isActive
                    ? "text-white border-secondary-500"
                    : "text-primary-300 border-transparent hover:text-white hover:border-primary-500"
                )}
                aria-pressed={isActive}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === "summary" && (
            <div className="space-y-6 text-sm text-primary-100">
              <div className="flex flex-col gap-4 rounded-2xl bg-primary-900/60 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-base font-semibold text-white">{t("trades.summary.title")}</p>
                  <p className="text-primary-200">{t("trades.summary.description")}</p>
                </div>
                <Button type="button" variant="light" className="min-w-40" onClick={handleOpenModal}>
                  <span className="inline-flex items-center gap-2">
                    <PlusIcon size={16} weight="bold" />
                    {t("trades.newSession.button")}
                  </span>
                </Button>
              </div>

              {statusMessage && (
                <p className={cn("text-sm", statusType === "success" ? "text-green-400" : "text-red-400")}>
                  {statusMessage}
                </p>
              )}

              {(hasAnalyticsError || hasSessionsError) && (
                <p className="text-sm text-red-300">{t("trades.apiErrors.requestFailed")}</p>
              )}

              {isLoadingAnalytics ? (
                <SummaryTabSkeleton />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label={t("trades.summary.cards.timeInvested")}
                      value={totalTimeInvested}
                      hint={t("trades.summary.cards.periodHint")}
                    />
                    <MetricCard
                      label={t("trades.summary.cards.successRate")}
                      value={`${summaryData.successRate}%`}
                      hint={t("trades.summary.cards.winsLosses", { wins: summaryData.wins, losses: summaryData.losses })}
                      tone={summaryData.successRate >= 50 ? "positive" : "negative"}
                    />
                    <MetricCard
                      label={t("trades.summary.cards.totalPnl")}
                      value={`${summaryData.totalPnl >= 0 ? "+" : ""}${formatMoney(summaryData.totalPnl)}`}
                      hint={t("trades.summary.cards.totalTrades", { count: summaryData.totalTrades })}
                      tone={summaryData.totalPnl >= 0 ? "positive" : "negative"}
                    />
                    <MetricCard
                      label={t("trades.summary.cards.completedSessions")}
                      value={`${summaryData.completedSessions}`}
                      hint={t("trades.summary.cards.activeSessions", { count: summaryData.activeSessions })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <ChartCard
                      title={t("trades.summary.charts.timeByMonth")}
                      subtitle={t("trades.summary.charts.monthlyBase")}
                      labels={charts.monthLabels}
                      data={charts.timeByMonth}
                      color="#2E5C8A"
                      valueSuffix="hr"
                    />
                    <ChartCard
                      title={t("trades.summary.charts.successByMonth")}
                      subtitle={t("trades.summary.charts.monthlyBase")}
                      labels={charts.monthLabels}
                      data={charts.successByMonth}
                      color="#2E5C8A"
                      valueSuffix="%"
                    />
                    <ChartCard
                      title={t("trades.summary.charts.tradesBySymbol")}
                      subtitle={t("trades.summary.charts.symbolBase")}
                      labels={charts.symbolLabels}
                      data={charts.tradesBySymbol}
                      color="#2E5C8A"
                      type="horizontal-bar"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "sessions" && (
            <div className="space-y-6 text-sm text-primary-100">
              <div className="space-y-2">
                <p className="font-semibold text-white">{t("trades.sessions.title")}</p>
                <p className="text-primary-200">{t("trades.sessions.description")}</p>
              </div>

              <div className="space-y-3">
                {isLoadingSessions ? (
                  <SessionsTabSkeleton />
                ) : (
                  <>
                    {!sessions.length && (
                      <p className="text-sm text-primary-300">{t("trades.sessions.empty")}</p>
                    )}

                    {sessions.map((session) => {
                      const wins = session.wins;
                      const losses = session.losses;
                      const totalPnl = session.totalPnl;
                      const successRate = session.successRate;

                      return (
                        <div
                          key={session.id}
                          className="rounded-xl bg-primary-950/50 p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-white">{session.name}</p>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                session.status === "active"
                                  ? "bg-secondary-500/20 text-secondary-200"
                                  : "bg-primary-800/70 text-primary-200"
                              )}
                            >
                              {session.status === "active"
                                ? t("trades.sessions.status.active")
                                : t("trades.sessions.status.completed")}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-primary-200 sm:grid-cols-2 lg:grid-cols-4">
                            <p>{t("trades.sessions.labels.market", { symbol: formatMarketSymbol(session.symbol) })}</p>
                            <p>{t(`trades.sessions.labels.slot.${session.session}`)}</p>
                            <p>{t("trades.sessions.labels.timeframe", { value: session.timeframe })}</p>
                            <p>{t("trades.sessions.labels.trades", { count: session.totalTrades })}</p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                            <span className={cn("font-semibold", totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                              {t("trades.sessions.labels.pnl")}: {totalPnl >= 0 ? "+" : ""}{formatMoney(totalPnl)}
                            </span>
                            <span className={cn("font-semibold", successRate >= 50 ? "text-green-400" : "text-red-400")}>
                              {t("trades.sessions.labels.successRate")}: {successRate}%
                            </span>
                            <span className="text-primary-300">
                              {t("trades.sessions.labels.winsLosses", { wins, losses })}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-primary-300">
                        {t("trades.sessions.page", { page: sessionsPage })}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => loadSessionsData(sessionsPage - 1)}
                          disabled={!canGoToPrevSessionsPage}
                        >
                          {t("trades.sessions.previous")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="light"
                          onClick={() => loadSessionsData(sessionsPage + 1)}
                          disabled={!canGoToNextSessionsPage}
                        >
                          {t("trades.sessions.next")}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
              <MarketSymbolPicker
                label={t("trades.newSession.fields.market")}
                value={form.symbol}
                options={marketOptions}
                isLoading={isLoadingMarketOptions}
                onChange={(nextSymbol) => setForm((prev) => ({ ...prev, symbol: nextSymbol }))}
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

      {activeReplaySession && (
        <div className="fixed inset-0 z-70 flex bg-primary-950">
          <aside className="flex w-20 shrink-0 flex-col items-center border-r border-black bg-black px-3 py-4">
            <button
              type="button"
              onClick={handleRequestExitReplay}
              className="rounded-lg p-1 transition hover:opacity-85"
              aria-label={t("trades.replay.exit")}
              title={t("trades.replay.exit")}
            >
              <Image
                src="/simcorex-logo-only.png"
                alt="Simcorex"
                width={48}
                height={32}
                className="h-8 w-12 object-contain"
                priority
              />
            </button>

            <button
              type="button"
              onClick={handleRequestExitReplay}
              className="mt-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary-700/70 bg-black text-primary-100 transition hover:border-primary-500/70 hover:text-white"
              aria-label={t("trades.replay.exit")}
              title={t("trades.replay.exit")}
            >
              <ArrowLeftIcon size={22} weight="bold" />
            </button>
          </aside>

          <div className="relative flex-1 bg-primary-950">
            <iframe
              title="TradingView Replay"
              className="h-full w-full"
              src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(chartSymbol)}&interval=5&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hide_side_toolbar=0&allow_symbol_change=1&save_image=1&from=${replayFrom}&to=${replayTo}`}
            />
          </div>

          {isExitReplayModalOpen && (
            <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <p className="text-base font-semibold text-white">{t("trades.replay.exit")}</p>
                <p className="mt-2 text-sm text-primary-200">{t("trades.replay.confirmExit")}</p>

                <div className="mt-5 flex justify-center gap-2">
                  <Button type="button" variant="light" onClick={handleCancelExitReplay}>
                    {t("trades.replay.stay")}
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleConfirmExitReplay}>
                    {t("trades.replay.end")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-2xl bg-primary-900/60 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <p className="text-xs uppercase tracking-wide text-primary-300">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold text-white",
          tone === "positive" && "text-green-400",
          tone === "negative" && "text-red-400"
        )}
      >
        {value}
      </p>
      <p className="text-xs text-primary-300">{hint}</p>
    </div>
  );
}

function SummaryTabSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`trades-summary-skeleton-metric-${index}`}
            className="rounded-2xl bg-primary-900/60 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          >
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="mt-3 h-8 w-16 rounded" />
            <Skeleton className="mt-3 h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`trades-summary-skeleton-chart-${index}`}
            className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          >
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="mt-2 h-6 w-44 rounded" />
            <Skeleton className="mt-4 h-56 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </>
  );
}

function SessionsTabSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: SESSIONS_PAGE_SIZE }).map((_, index) => (
        <div
          key={`trades-sessions-skeleton-${index}`}
          className="rounded-xl bg-primary-950/50 p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((__, lineIndex) => (
              <Skeleton key={`trades-sessions-skeleton-line-${index}-${lineIndex}`} className="h-3 w-24 rounded" />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

type ChartCardProps = {
  title: string;
  subtitle: string;
  labels: string[];
  data: number[];
  color: string;
  valueSuffix?: string;
  type?: "bar" | "horizontal-bar";
};

function ChartCard({
  title,
  subtitle,
  labels,
  data,
  color,
  valueSuffix = "",
  type = "bar",
}: ChartCardProps) {

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div>
        <div>
          <p className="text-sm text-primary-300">{subtitle}</p>
          <p className="text-lg font-semibold text-white">{title}</p>
        </div>
      </div>

      <div className="mt-4 h-56">
        {type === "horizontal-bar" ? (
          <TradesBySymbolChart data={data} labels={labels} valueSuffix={valueSuffix} color={color} />
        ) : (
          <BarChart data={data} color={color} labels={labels} valueSuffix={valueSuffix} />
        )}
      </div>
    </div>
  );
}

type BarChartProps = {
  data: number[];
  labels: string[];
  color: string;
  valueSuffix?: string;
};

function BarChart({ data, labels, color, valueSuffix = "" }: BarChartProps) {
  const height = 200;
  const max = Math.max(...data);
  const min = 0;
  const yRange = max === min ? 1 : max - min;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const animationSeed = useMemo(() => `${labels.join("|")}::${data.join("|")}::${valueSuffix}`, [data, labels, valueSuffix]);

  useEffect(() => {
    setIsAnimated(false);
    const frame = window.requestAnimationFrame(() => {
      setIsAnimated(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [animationSeed]);

  return (
    <div className="relative h-full w-full">
      <div className="flex h-52 items-end gap-2">
        {data.map((value, idx) => {
          const barHeight = ((value - min) / yRange) * height;
          const isHover = hoverIdx === idx;
          return (
            <div
              key={`${value}-${idx}`}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${barHeight}px`,
                position: "relative",
              }}
              aria-label={`${labels[idx]}: ${value}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <div
                className="h-full w-full rounded-t-sm"
                style={{
                  transformOrigin: "bottom",
                  transform: isAnimated ? "scaleY(1)" : "scaleY(0)",
                  transition: `transform 640ms cubic-bezier(0.2, 0.9, 0.2, 1) ${idx * 45}ms`,
                  backgroundImage: `linear-gradient(to top, ${color}08 0%, ${color}50 40%, ${color}CC 75%, ${color}FF 100%)`,
                  opacity: isHover ? 1 : 0.82,
                  boxShadow: isHover
                    ? `inset 0 1px 0 rgba(255,255,255,0.3), 0 0 18px ${color}50`
                    : `inset 0 1px 0 rgba(255,255,255,0.12)`,
                }}
              />
            </div>
          );
        })}
      </div>

      {hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-10 left-0 flex w-full justify-center">
          <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <div className="font-semibold text-white">{labels[hoverIdx]}</div>
            <div className="text-primary-100">{data[hoverIdx]}{valueSuffix}</div>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-[10px] text-primary-300">
        {labels.map((label, idx) => (
          <span key={`${label}-${idx}`}>{label}</span>
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

function MarketSymbolPicker({
  label,
  value,
  options,
  isLoading,
  onChange,
}: {
  label: string;
  value: string;
  options: MarketOption[];
  isLoading: boolean;
  onChange: (nextValue: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => {
      return [option.symbol, option.market, option.description, option.value]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-2 text-sm text-primary-100">
      <span className="font-medium">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-secondary-500/40 bg-primary-900/60 px-4 py-3 text-left text-white outline-none transition focus-visible:border-secondary-400 focus-visible:ring-2 focus-visible:ring-secondary-500/30",
          !selected && "text-primary-300"
        )}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {isLoading ? (
          <Skeleton as="span" className="inline-block h-4 w-44 rounded" />
        ) : (
          <span>
            {selected ? `${selected.symbol} • ${selected.market}` : "Selecionar mercado"}
          </span>
        )}
        <ChevronDown />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-75 rounded-2xl border border-[#2E5C8A]/50 bg-[#1B314B] p-2 shadow-[0_14px_32px_rgba(0,0,0,0.35)]">
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar símbolo ou mercado..."
            className="mb-2 h-10 w-full rounded-xl border border-[#2E5C8A]/50 bg-primary-950/80 px-3 text-sm text-white outline-none transition focus:border-secondary-400"
          />

          <div className="max-h-56 overflow-auto rounded-lg">
            {isLoading ? (
              <div className="space-y-2 px-3 py-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`market-picker-skeleton-${index}`} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-primary-300">Nenhum resultado</div>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition",
                      isSelected ? "bg-[#2E5C8A]/45" : "hover:bg-[#2E5C8A]/25"
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{option.symbol}</div>
                      <div className="text-xs text-primary-200">{option.market} • {option.description}</div>
                    </div>
                    <span className="text-[11px] text-primary-300">{option.value}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-primary-200" aria-hidden>
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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

function formatMoney(value: number) {
  return Math.abs(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}

function inferSessionSlot(startedAt: string | undefined): SessionSlot {
  if (!startedAt) return "ny";

  const parsedDate = new Date(startedAt);
  if (Number.isNaN(parsedDate.getTime())) return "ny";

  const utcHour = parsedDate.getUTCHours();
  if (utcHour < 7) return "asia";
  if (utcHour < 13) return "london";
  return "ny";
}

function mapBackendSessionStatusToLocal(status: string | undefined): MarketSessionRecord["status"] {
  const normalized = (status || "").toUpperCase();
  if (normalized === "COMPLETED" || normalized === "CANCELED") return "completed";
  return "active";
}

function normalizeSessionSlot(value: string | undefined, startedAt: string | undefined): SessionSlot {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "asia") return "asia";
  if (normalized === "london") return "london";
  if (normalized === "ny" || normalized === "new_york" || normalized === "newyork") {
    return "ny";
  }

  return inferSessionSlot(startedAt);
}

function mapSessionFromApi(session: SessionRecordResponse): MarketSessionRecord {
  return {
    id: session.id,
    name: session.name,
    symbol: session.marketSymbol,
    session: normalizeSessionSlot(session.sessionSlot, session.startedAt || session.startDate),
    status: mapBackendSessionStatusToLocal(session.status),
    startedAt: session.startedAt || session.startDate,
    endedAt: session.endedAt || undefined,
    timeframe: session.timeframe,
    timeInvestedMinutes: Number(session.timeInvestedMinutes ?? 0),
    totalTrades: Number(session.totalTrades ?? 0),
    wins: Number(session.wins ?? 0),
    losses: Number(session.losses ?? 0),
    totalPnl: Number(session.netPnl ?? session.grossPnl ?? 0),
    successRate: Number(session.winRate ?? 0),
  };
}

function formatMonthLabel(month: string, language: string) {
  const [year, value] = month.split("-");
  const monthIndex = Number(value) - 1;
  if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return month;

  const locale = getLocale(language);
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(Date.UTC(Number(year) || 1970, monthIndex, 1))
  );
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

function normalizeMarketOption(item: MarketSymbolItem): MarketOption {
  return {
    value: item.symbol,
    symbol: item.symbol,
    market: item.market,
    description: item.label,
  };
}

function toTradingViewSymbol(symbol?: string) {
  if (!symbol) return "FX:EURUSD";
  if (symbol.includes(":")) return symbol;
  if (symbol === "EURUSD") return "FX:EURUSD";
  if (symbol === "BTCUSD") return "BITSTAMP:BTCUSD";
  if (symbol === "NASDAQ") return "NASDAQ:NDX";
  return "FX:EURUSD";
}

function formatMarketSymbol(symbol: string) {
  if (!symbol) return "--";
  if (symbol.includes(":")) {
    return symbol.split(":")[1] ?? symbol;
  }
  return symbol;
}

function toUnixTimestamp(date: string | undefined, endOfDay: boolean) {
  if (!date) return "";
  const isoDate = endOfDay ? `${date}T23:59:59.000Z` : `${date}T00:00:00.000Z`;
  return String(Math.floor(new Date(isoDate).getTime() / 1000));
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

