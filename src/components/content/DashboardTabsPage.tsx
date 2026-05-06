"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { DatePicker } from "@/components/forms/DatePicker";
import { SelectField } from "@/components/forms/SelectField";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { DashboardSummaryContent } from "@/components/content/DashboardSummaryContent";
import { TradesBySymbolChart } from "@/components/charts/TradesBySymbolChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { SESSION_CLOSED_EVENT } from "@/constants/sessionEvents";
import { createJournal, getDayJournal, listJournals, updateJournal } from "@/lib/api/journals";
import { getMarketSymbols } from "@/lib/api/reference";
import { completeSession, createSession, getSessionAnalytics, listSessions } from "@/lib/api/trades";
import { cn } from "@/lib/classNames";
import { isApiError } from "@/lib/types/api";
import type { DayJournal } from "@/lib/types/journals";
import type { MarketSymbolItem } from "@/lib/types/reference";
import type { SessionAnalyticsResponse, SessionRecordResponse, SessionStatus } from "@/lib/types/trades";
import {
  ArrowLeft as ArrowLeftIcon,
  GearSix as GearSixIcon,
  Plus as PlusIcon,
  TrendUp as TrendUpIcon,
  X as XIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, FocusEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

const tabs = [
  { key: "summary", labelKey: "trades.tabs.summary" },
  { key: "sessions", labelKey: "trades.tabs.sessions" },
  { key: "journal", labelKey: "trades.tabs.journal" },
] as const;

const SESSIONS_PAGE_SIZE = 5;
const JOURNALS_PAGE_SIZE = 10;
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
type SessionsStatusFilter = "all" | "active" | "completed";

function isTabKey(value: string | null): value is TabKey {
  return tabs.some((tab) => tab.key === value);
}

function isSessionsStatusFilter(value: string): value is SessionsStatusFilter {
  return value === "all" || value === "active" || value === "completed";
}

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
  mode: "editable" | "readonly";
  status: SessionStatus;
};

type SessionSlot = "asia" | "london" | "ny";

type MarketSessionRecord = {
  id: string;
  name: string;
  symbol: string;
  session: SessionSlot;
  status: "active" | "completed";
  backendStatus: SessionStatus;
  startDate: string;
  endDate: string | null;
  accountBalanceStart: number;
  accountBalanceEnd: number | null;
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
type JournalModalMode = "create" | "edit";
type ReplaySidebarTool = "chart" | "settings" | "stats";

export function DashboardTabsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [sessions, setSessions] = useState<MarketSessionRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsHasNextPage, setSessionsHasNextPage] = useState(false);
  const [sessionsStatusFilter, setSessionsStatusFilter] = useState<SessionsStatusFilter>("all");
  const [journals, setJournals] = useState<DayJournal[]>([]);
  const [isLoadingJournals, setIsLoadingJournals] = useState(false);
  const [hasJournalsError, setHasJournalsError] = useState(false);
  const [journalsPage, setJournalsPage] = useState(1);
  const [journalsHasNextPage, setJournalsHasNextPage] = useState(false);
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
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [hasAnalyticsError, setHasAnalyticsError] = useState(false);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [activeReplaySession, setActiveReplaySession] = useState<ReplaySessionState | null>(null);
  const [activeReplaySidebarTool, setActiveReplaySidebarTool] = useState<ReplaySidebarTool>("chart");
  const [isExitReplayModalOpen, setIsExitReplayModalOpen] = useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [endDatePickerAnchorDate, setEndDatePickerAnchorDate] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [marketOptions, setMarketOptions] = useState<MarketOption[]>([]);
  const [isLoadingMarketOptions, setIsLoadingMarketOptions] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalModalMode, setJournalModalMode] = useState<JournalModalMode>("create");
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [journalDraftDate, setJournalDraftDate] = useState(getDefaultEndDate());
  const [journalDraftTitle, setJournalDraftTitle] = useState("");
  const [journalDraftContent, setJournalDraftContent] = useState("");
  const [isJournalDatePickerOpen, setIsJournalDatePickerOpen] = useState(false);
  const [isJournalSaving, setIsJournalSaving] = useState(false);
  const [journalStatusMessage, setJournalStatusMessage] = useState<string | null>(null);
  const [journalStatusType, setJournalStatusType] = useState<"success" | "error" | null>(null);
  const [isJournalConflictModalOpen, setIsJournalConflictModalOpen] = useState(false);
  const [conflictJournalDate, setConflictJournalDate] = useState<string | null>(null);
  const [isOpeningExistingJournal, setIsOpeningExistingJournal] = useState(false);
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

  const loadSessionsData = useCallback(async (page = 1, statusFilter: SessionsStatusFilter = "all") => {
    setIsLoadingSessions(true);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const status = getSessionsApiStatusFilter(statusFilter);
      const response = await listSessions({
        page,
        limit: SESSIONS_PAGE_SIZE,
        status,
        sortBy: "startedAt",
        sortOrder: "desc",
        timezone,
      });

      const mappedSessions = (response.data ?? []).map(mapSessionFromApi);
      setSessions(
        statusFilter === "all"
          ? mappedSessions
          : mappedSessions.filter((session) => session.status === statusFilter)
      );
      setSessionsPage(response.page || page);
      setSessionsHasNextPage(Boolean(response.hasNextPage));
    } catch {
      setSessions([]);
      setSessionsPage(1);
      setSessionsHasNextPage(false);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadJournalsData = useCallback(async (page = 1) => {
    setIsLoadingJournals(true);
    setHasJournalsError(false);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await listJournals({
        page,
        limit: JOURNALS_PAGE_SIZE,
        sortBy: "tradingDay",
        sortOrder: "desc",
        scope: "day",
        timezone,
      });

      setJournals(response.data ?? []);
      setJournalsPage(response.page || page);
      setJournalsHasNextPage(Boolean(response.hasNextPage));
    } catch {
      setJournals([]);
      setJournalsPage(1);
      setJournalsHasNextPage(false);
      setHasJournalsError(true);
    } finally {
      setIsLoadingJournals(false);
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
    loadSummaryData();
  }, [loadSummaryData]);

  useEffect(() => {
    loadSessionsData(1, sessionsStatusFilter);
  }, [loadSessionsData, sessionsStatusFilter]);

  useEffect(() => {
    if (activeTab !== "journal") return;
    loadJournalsData(1);
  }, [activeTab, loadJournalsData]);

  useEffect(() => {
    const tabFromQuery = searchParams.get("tab");
    if (!isTabKey(tabFromQuery)) return;
    if (tabFromQuery === activeTab) return;

    setActiveTab(tabFromQuery);
  }, [activeTab, searchParams]);

  useEffect(() => {
    const shouldOpenReplay = searchParams.get("openReplay") === "1";
    const sessionId = searchParams.get("sessionId");
    if (!shouldOpenReplay || !sessionId) return;

    const parsedBalance = Number(searchParams.get("balance"));
    const startDate = searchParams.get("startDate") ?? getDefaultStartDate();
    const endDate = searchParams.get("endDate") ?? getDefaultEndDate();
    const symbol = searchParams.get("symbol") ?? "EURUSD";
    const sessionName = searchParams.get("sessionName") ?? t("trades.newSession.title");
    const sessionStatus = normalizeSessionStatus(searchParams.get("sessionStatus") ?? "IN_PROGRESS");

    setActiveReplaySession({
      sessionId,
      sessionName,
      accountBalance: Number.isFinite(parsedBalance) ? parsedBalance : 100000,
      symbol,
      startDate,
      endDate,
      mode: isEditableSessionStatus(sessionStatus) ? "editable" : "readonly",
      status: sessionStatus,
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
      "sessionStatus",
    ].forEach((key) => nextParams.delete(key));

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/dashboard?${nextQuery}` : "/dashboard");
  }, [router, searchParams, t]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onSessionClosed = (event: Event) => {
      const sessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (!sessionId) return;

      setStatusType("error");
      setStatusMessage(t("trades.apiErrors.sessionClosed"));

      setActiveReplaySession((previous) => {
        if (!previous || previous.sessionId !== sessionId) {
          return previous;
        }

        return {
          ...previous,
          mode: "readonly",
          status: "COMPLETED",
        };
      });

      void Promise.all([loadSessionsData(sessionsPage, sessionsStatusFilter), loadSummaryData()]);
    };

    window.addEventListener(SESSION_CLOSED_EVENT, onSessionClosed);
    return () => {
      window.removeEventListener(SESSION_CLOSED_EVENT, onSessionClosed);
    };
  }, [loadSessionsData, loadSummaryData, sessionsPage, sessionsStatusFilter, t]);

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

  const resetJournalDraft = () => {
    setJournalDraftDate(getDefaultEndDate());
    setJournalDraftTitle("");
    setJournalDraftContent("");
    setIsJournalDatePickerOpen(false);
    setEditingJournalId(null);
    setJournalModalMode("create");
  };

  const handleOpenJournalModal = () => {
    setJournalStatusMessage(null);
    setJournalStatusType(null);
    setIsJournalConflictModalOpen(false);
    setConflictJournalDate(null);
    resetJournalDraft();
    setIsJournalModalOpen(true);
  };

  const handleCloseJournalModal = () => {
    setIsJournalModalOpen(false);
    setIsJournalDatePickerOpen(false);
    setIsOpeningExistingJournal(false);
    resetJournalDraft();
  };

  const openJournalForEdit = (journal: DayJournal) => {
    setJournalModalMode("edit");
    setEditingJournalId(journal.id);
    setJournalDraftDate(journal.tradingDay);
    setJournalDraftTitle(journal.title ?? "");
    setJournalDraftContent(journal.content ?? "");
    setIsJournalDatePickerOpen(false);
    setIsJournalModalOpen(true);
  };

  const handleOpenConflictJournalForEdit = async () => {
    if (!conflictJournalDate) return;

    setIsOpeningExistingJournal(true);

    try {
      const response = await getDayJournal(conflictJournalDate);
      if (!response.data) {
        setJournalStatusType("error");
        setJournalStatusMessage(t("trades.journal.errors.loadExisting"));
        return;
      }

      setIsJournalConflictModalOpen(false);
      setConflictJournalDate(null);
      openJournalForEdit(response.data);
    } catch {
      setJournalStatusType("error");
      setJournalStatusMessage(t("trades.journal.errors.loadExisting"));
    } finally {
      setIsOpeningExistingJournal(false);
    }
  };

  const handleSaveJournal = async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const normalizedDate = journalDraftDate.trim();
    const normalizedTitle = journalDraftTitle.trim();
    const normalizedContent = normalizeJournalEditorContent(journalDraftContent);

    if (journalModalMode === "create" && !normalizedDate) {
      setJournalStatusType("error");
      setJournalStatusMessage(t("trades.journal.errors.dateRequired"));
      return;
    }

    if (isRichTextEffectivelyEmpty(normalizedContent)) {
      setJournalStatusType("error");
      setJournalStatusMessage(t("trades.journal.errors.contentRequired"));
      return;
    }

    setIsJournalSaving(true);

    try {
      if (journalModalMode === "edit" && editingJournalId) {
        await updateJournal(editingJournalId, {
          title: normalizedTitle || null,
          content: normalizedContent,
          metadata: null,
        });

        await loadJournalsData(journalsPage);
        setJournalStatusType("success");
        setJournalStatusMessage(t("trades.journal.updated"));
        handleCloseJournalModal();
        return;
      }

      await createJournal({
        tradingDay: normalizedDate,
        timezone,
        scope: "day",
        title: normalizedTitle || null,
        content: normalizedContent,
        metadata: null,
      });

      await loadJournalsData(1);
      setJournalStatusType("success");
      setJournalStatusMessage(t("trades.journal.created"));
      handleCloseJournalModal();
    } catch (error) {
      if (isApiError(error) && error.statusCode === 409) {
        setIsJournalModalOpen(false);
        setIsJournalConflictModalOpen(true);
        setConflictJournalDate(normalizedDate);
        return;
      }

      setJournalStatusType("error");
      setJournalStatusMessage(t("trades.journal.errors.save"));
    } finally {
      setIsJournalSaving(false);
    }
  };

  const handleCancelJournalConflict = () => {
    setIsJournalConflictModalOpen(false);
    setConflictJournalDate(null);
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

      await Promise.all([loadSessionsData(1, sessionsStatusFilter), loadSummaryData()]);
      setStatusType(null);
      setStatusMessage(null);
      setIsNewSessionModalOpen(false);
      resetForm();
      router.push(`/session/${created.id}`);
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
        setStatusMessage(t("trades.apiErrors.createSessionFailed"));
      }
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleRequestExitReplay = () => {
    if (!activeReplaySession) return;

    if (activeReplaySession.mode === "readonly") {
      setIsExitReplayModalOpen(false);
      setActiveReplaySession(null);
      void Promise.all([loadSessionsData(sessionsPage, sessionsStatusFilter), loadSummaryData()]);
      return;
    }

    setIsExitReplayModalOpen(true);
  };

  const handleCancelExitReplay = () => {
    setIsExitReplayModalOpen(false);
  };

  const handlePauseExitReplay = async () => {
    if (!activeReplaySession) return;

    const pausedSessionId = activeReplaySession.sessionId;

    setSessions((previous) =>
      previous.map((session) =>
        session.id === pausedSessionId
          ? {
              ...session,
              status: "active",
              backendStatus: "IN_PROGRESS",
            }
          : session
      )
    );

    setIsExitReplayModalOpen(false);
    setActiveReplaySession(null);
    await Promise.all([loadSessionsData(sessionsPage, sessionsStatusFilter), loadSummaryData()]);
  };

  const handleConfirmExitReplay = async () => {
    if (!activeReplaySession) return;

    if (activeReplaySession.mode === "readonly") {
      setIsExitReplayModalOpen(false);
      setActiveReplaySession(null);
      await Promise.all([loadSessionsData(sessionsPage, sessionsStatusFilter), loadSummaryData()]);
      return;
    }

    const closingSessionId = activeReplaySession.sessionId;
    const completionTimestamp = new Date().toISOString();

    try {
      await completeSession(activeReplaySession.sessionId, {
        accountBalanceEnd: roundToTwoDecimals(activeReplaySession.accountBalance),
        endedAt: completionTimestamp,
      });
      setSessions((previous) =>
        previous.map((session) =>
          session.id === closingSessionId
            ? {
                ...session,
                status: "completed",
                backendStatus: "COMPLETED",
              }
            : session
        )
      );
    } catch (error) {
      setStatusType("error");
      if (isApiError(error)) {
        if (error.code === "INVALID_SESSION_DATES") {
          setStatusMessage(t("trades.apiErrors.invalidSessionDates"));
        } else {
          setStatusMessage(null);
          setStatusType(null);
        }
      } else {
        setStatusMessage(null);
        setStatusType(null);
      }
      return;
    }

    setIsExitReplayModalOpen(false);
    setActiveReplaySession(null);
    await Promise.all([loadSessionsData(sessionsPage, sessionsStatusFilter), loadSummaryData()]);
  };

  const handleSessionsStatusFilterChange = useCallback(
    (nextFilter: SessionsStatusFilter) => {
      setSessionsStatusFilter(nextFilter);
    },
    []
  );

  const handleReopenSession = (sessionId: string) => {
    setOpeningSessionId(sessionId);
    setStatusMessage(null);
    setStatusType(null);
    router.push(`/session/${sessionId}`);
    setOpeningSessionId(null);
  };

  const handleTabChange = useCallback((nextTab: TabKey) => {
    setActiveTab(nextTab);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", nextTab);
    const nextQuery = nextParams.toString();

    router.replace(nextQuery ? `/dashboard?${nextQuery}` : "/dashboard");
  }, [router, searchParams]);

  const chartSymbol = useMemo(() => toTradingViewSymbol(activeReplaySession?.symbol), [activeReplaySession?.symbol]);
  const replayFrom = useMemo(() => toUnixTimestamp(activeReplaySession?.startDate, false), [activeReplaySession?.startDate]);
  const replayTo = useMemo(() => toUnixTimestamp(activeReplaySession?.endDate, true), [activeReplaySession?.endDate]);
  const canGoToPrevSessionsPage = sessionsPage > 1 && !isLoadingSessions;
  const canGoToNextSessionsPage = sessionsHasNextPage && !isLoadingSessions;
  const canGoToPrevJournalsPage = journalsPage > 1 && !isLoadingJournals;
  const canGoToNextJournalsPage = journalsHasNextPage && !isLoadingJournals;
  const sessionsStatusOptions = useMemo(
    () => [
      { value: "all", label: t("trades.sessions.filters.all") },
      { value: "completed", label: t("trades.sessions.filters.completed") },
      { value: "active", label: t("trades.sessions.filters.active") },
    ],
    [t]
  );
  const replaySidebarItems = [
    {
      key: "chart" as const,
      label: t("trades.replay.sidebar.chart"),
      svgSrc: "/candlestick-chart-svgrepo-com.svg",
    },
    { key: "settings" as const, label: t("trades.replay.sidebar.settings"), Icon: GearSixIcon },
    { key: "stats" as const, label: t("trades.replay.sidebar.stats"), Icon: TrendUpIcon },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("nav.dashboard")}</PageTitle>

      <div className="overflow-hidden rounded-2xl bg-primary-900/60 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="flex gap-3 bg-primary-900/50 px-3 pt-3">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
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
                  {isLoadingAnalytics ? (
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-8 w-48 rounded" />
                    </div>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wide text-primary-300">{t("trades.summary.cards.totalPnl")}</p>
                      <p
                        className={cn(
                          "text-xl font-semibold",
                          hasAnalyticsError
                            ? "text-primary-200"
                            : summaryData.totalPnl >= 0
                              ? "text-green-400"
                              : "text-red-400"
                        )}
                      >
                        {hasAnalyticsError
                          ? "-"
                          : `${summaryData.totalPnl < 0 ? "-" : ""}${formatMoney(summaryData.totalPnl, i18n.language)} USD`}
                      </p>
                    </>
                  )}
                </div>
                <Button type="button" variant="light" size="sm" className="min-w-40" onClick={handleOpenModal}>
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

              <DashboardSummaryContent />
            </div>
          )}

          {activeTab === "sessions" && (
            <div className="space-y-6 text-sm text-primary-100">
              <div className="flex flex-col gap-4 rounded-2xl bg-primary-900/60 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="font-semibold text-white">{t("trades.sessions.title")}</p>
                  <p className="text-primary-200">{t("trades.sessions.description")}</p>
                </div>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
                  <div className="w-full sm:min-w-40">
                    <SelectField
                      compact
                      label={t("trades.sessions.filters.label")}
                      value={sessionsStatusFilter}
                      options={sessionsStatusOptions}
                      className="h-9 rounded-xl px-3 py-1.5 text-xs"
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        if (!isSessionsStatusFilter(nextValue)) return;
                        handleSessionsStatusFilterChange(nextValue);
                      }}
                    />
                  </div>

                  <Button type="button" variant="light" size="sm" className="min-w-40" onClick={handleOpenModal}>
                    <span className="inline-flex items-center gap-2">
                      <PlusIcon size={16} weight="bold" />
                      {t("trades.newSession.button")}
                    </span>
                  </Button>
                </div>
              </div>

              {statusMessage && (
                <p className={cn("text-sm", statusType === "success" ? "text-green-400" : "text-red-400")}>
                  {statusMessage}
                </p>
              )}

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
                      const canReopen = session.status === "active";
                      const isOpeningThisSession = openingSessionId === session.id;

                      return (
                        <div
                          key={session.id}
                          className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
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
                              {t("trades.sessions.labels.pnl")}: {totalPnl < 0 ? "-" : ""}{formatMoney(totalPnl)}
                            </span>
                            <span className={cn("font-semibold", successRate >= 50 ? "text-green-400" : "text-red-400")}>
                              {t("trades.sessions.labels.successRate")}: {successRate}%
                            </span>
                            <span className="text-primary-300">
                              {t("trades.sessions.labels.winsLosses", { wins, losses })}
                            </span>
                          </div>

                          {canReopen && (
                            <div className="mt-4 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="light"
                                onClick={() => handleReopenSession(session.id)}
                                isLoading={isOpeningThisSession}
                                disabled={Boolean(openingSessionId && !isOpeningThisSession)}
                              >
                                {t("trades.sessions.actions.reopen")}
                              </Button>
                            </div>
                          )}
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
                          onClick={() => loadSessionsData(sessionsPage - 1, sessionsStatusFilter)}
                          disabled={!canGoToPrevSessionsPage}
                        >
                          {t("trades.sessions.previous")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="light"
                          onClick={() => loadSessionsData(sessionsPage + 1, sessionsStatusFilter)}
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

          {activeTab === "journal" && (
            <div className="space-y-6 text-sm text-primary-100">
              <div className="flex flex-col gap-4 rounded-2xl bg-primary-900/60 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-white">{t("trades.journal.title")}</p>
                  <p className="text-primary-200">{t("trades.journal.description")}</p>
                </div>
                <Button type="button" variant="light" size="sm" className="min-w-40" onClick={handleOpenJournalModal}>
                  <span className="inline-flex items-center gap-2">
                    <PlusIcon size={16} weight="bold" />
                    {t("trades.journal.add")}
                  </span>
                </Button>
              </div>

              {journalStatusMessage && (
                <p className={cn("text-sm", journalStatusType === "success" ? "text-green-400" : "text-red-400")}>
                  {journalStatusMessage}
                </p>
              )}

              {hasJournalsError && (
                <p className="text-sm text-red-300">{t("trades.journal.errors.load")}</p>
              )}

              <div className="space-y-3">
                {isLoadingJournals ? (
                  <JournalsTabSkeleton />
                ) : (
                  <>
                    {!journals.length && (
                      <p className="text-sm text-primary-300">{t("trades.journal.empty")}</p>
                    )}

                    {journals.map((journal) => {
                      const preview = stripHtmlForPreview(journal.content);

                      return (
                        <div
                          key={journal.id}
                          className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-white">
                                {journal.title?.trim() || t("trades.journal.untitled")}
                              </p>
                              <p className="text-xs text-primary-300">
                                {formatJournalDate(journal.tradingDay, i18n.language)}
                              </p>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => openJournalForEdit(journal)}
                            >
                              {t("trades.journal.actions.edit")}
                            </Button>
                          </div>

                          <p className="mt-3 whitespace-pre-wrap wrap-break-word text-primary-100">
                            {preview || t("trades.journal.emptyContent")}
                          </p>

                          <p className="mt-3 text-xs text-primary-300">
                            {t("trades.journal.updatedAt", {
                              value: formatJournalTimestamp(journal.updatedAt, i18n.language),
                            })}
                          </p>
                        </div>
                      );
                    })}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-primary-300">
                        {t("trades.journal.page", { page: journalsPage })}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => loadJournalsData(journalsPage - 1)}
                          disabled={!canGoToPrevJournalsPage}
                        >
                          {t("trades.journal.actions.previous")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="light"
                          onClick={() => loadJournalsData(journalsPage + 1)}
                          disabled={!canGoToNextJournalsPage}
                        >
                          {t("trades.journal.actions.next")}
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
                    endDate: nextStartDate,
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
                minDate={form.startDate}
                rangeStart={form.startDate}
                rangeEnd={form.endDate}
                previewRangeOnHover
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

      {isJournalModalOpen && (
        <JournalEditorModal
          isOpen={isJournalModalOpen}
          mode={journalModalMode}
          titleValue={journalDraftTitle}
          contentValue={journalDraftContent}
          onTitleChange={setJournalDraftTitle}
          onContentChange={setJournalDraftContent}
          onClose={handleCloseJournalModal}
          onSave={handleSaveJournal}
          isSaving={isJournalSaving}
          saveLabel={
            journalModalMode === "edit"
              ? t("trades.journal.actions.save")
              : t("trades.journal.actions.create")
          }
          modalTitle={journalModalMode === "edit" ? t("trades.journal.editTitle") : t("trades.journal.newTitle")}
          titlePlaceholder={t("trades.journal.placeholders.title")}
          contentPlaceholder={t("trades.journal.placeholders.content")}
          dateLabel={t("trades.journal.fields.date")}
          dateValue={journalDraftDate}
          dateDisplayValue={formatJournalDate(journalDraftDate, i18n.language)}
          showDateField
          dateEditable={journalModalMode === "create"}
          datePickerOpen={isJournalDatePickerOpen}
          onDatePickerOpenChange={setIsJournalDatePickerOpen}
          onDateChange={(nextDate) => {
            setJournalDraftDate(nextDate);
            setIsJournalDatePickerOpen(false);
          }}
        />
      )}

      {isJournalConflictModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <p className="text-base font-semibold text-white">{t("trades.journal.conflictModal.title")}</p>
            <p className="mt-2 text-sm text-primary-200">
              {t("trades.journal.conflictModal.description", {
                date: conflictJournalDate
                  ? formatJournalDate(conflictJournalDate, i18n.language)
                  : "--",
              })}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleCancelJournalConflict}>
                {t("trades.journal.conflictModal.cancel")}
              </Button>
              <Button
                type="button"
                variant="light"
                onClick={handleOpenConflictJournalForEdit}
                isLoading={isOpeningExistingJournal}
              >
                {t("trades.journal.conflictModal.edit")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeReplaySession && (
        <div className="fixed inset-0 z-70 flex bg-primary-950">
          <aside className="relative z-30 flex w-20 shrink-0 flex-col items-center border-r border-black bg-black px-3 py-4">
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

            <div className="mt-6 flex w-full flex-col items-center gap-3">
              {replaySidebarItems.map(({ key, label, Icon, svgSrc }) => {
                const isActive = activeReplaySidebarTool === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveReplaySidebarTool(key)}
                    className={cn(
                      "group relative inline-flex h-11 w-11 items-center justify-center rounded-xl transition",
                      isActive
                        ? "text-white"
                        : "text-white/45"
                    )}
                    aria-label={label}
                    title={label}
                  >
                    {svgSrc ? (
                      <Image
                        src={svgSrc}
                        alt={label}
                        width={22}
                        height={22}
                        className={cn(
                            "h-5.5 w-5.5 object-contain transition",
                          isActive
                            ? "brightness-0 invert opacity-100"
                            : "brightness-0 invert opacity-45"
                        )}
                      />
                    ) : (
                      Icon && (
                        <Icon
                          size={22}
                          weight={isActive ? "duotone" : "regular"}
                          className={cn(isActive ? "opacity-100" : "opacity-70")}
                        />
                      )
                    )}
                    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-120 -translate-y-1/2 whitespace-nowrap rounded-md border border-primary-700/70 bg-primary-950/95 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

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
                  <Button type="button" variant="secondary" onClick={handlePauseExitReplay}>
                    {t("trades.replay.pause")}
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

export default DashboardTabsPage;

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
          className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
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

function JournalsTabSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`trades-journals-skeleton-${index}`}
          className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-44 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-5/6 rounded" />
          </div>
          <Skeleton className="mt-3 h-3 w-40 rounded" />
        </div>
      ))}
    </div>
  );
}

type JournalEditorModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  titleValue: string;
  contentValue: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  disableSave?: boolean;
  saveLabel: string;
  modalTitle: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
  dateLabel?: string;
  dateValue?: string;
  dateDisplayValue?: string;
  showDateField?: boolean;
  dateEditable?: boolean;
  datePickerOpen?: boolean;
  onDatePickerOpenChange?: (nextIsOpen: boolean) => void;
  onDateChange?: (nextDate: string) => void;
};

function JournalEditorModal({
  isOpen,
  mode,
  titleValue,
  contentValue,
  onTitleChange,
  onContentChange,
  onClose,
  onSave,
  isSaving,
  disableSave = false,
  saveLabel,
  modalTitle,
  titlePlaceholder,
  contentPlaceholder,
  dateLabel,
  dateValue,
  dateDisplayValue,
  showDateField = false,
  dateEditable = false,
  datePickerOpen,
  onDatePickerOpenChange,
  onDateChange,
}: JournalEditorModalProps) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const shouldCloseOnBackdropRef = useRef(false);
  const [activeColor, setActiveColor] = useState("#FFFFFF");
  const basicColors = ["#FFFFFF", "#F87171", "#FBBF24", "#4ADE80", "#60A5FA", "#A78BFA"];

  useEffect(() => {
    if (!isOpen) return;

    const editor = editorRef.current;
    if (!editor) return;

    const normalizedHtml = toJournalEditorHtml(contentValue);
    if (editor.innerHTML !== normalizedHtml) {
      editor.innerHTML = normalizedHtml;
    }
  }, [contentValue, isOpen]);

  if (!isOpen) return null;

  const syncEditorContent = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onContentChange(editor.innerHTML);
  };

  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
  };

  const applyCommand = (command: string, value?: string) => {
    focusEditor();
    document.execCommand(command, false, value);
    syncEditorContent();
  };

  const unwrapSelectedBlockquotes = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const blockquotes = Array.from(editor.querySelectorAll("blockquote")).filter((node) => {
      try {
        return range.intersectsNode(node);
      } catch {
        return false;
      }
    });

    blockquotes.forEach((quote) => {
      const fragment = document.createDocumentFragment();
      while (quote.firstChild) {
        fragment.appendChild(quote.firstChild);
      }
      quote.replaceWith(fragment);
    });
  };

  const toggleBlockquote = () => {
    applyCommand("formatBlock", "blockquote");
  };

  const applyColor = (color: string) => {
    setActiveColor(color);
    applyCommand("foreColor", color);
  };

  const clearFormatting = () => {
    focusEditor();
    document.execCommand("removeFormat", false);
    document.execCommand("unlink", false);
    unwrapSelectedBlockquotes();
    syncEditorContent();
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    applyCommand("insertText", pastedText);
  };

  const isEditorEmpty = isRichTextEffectivelyEmpty(contentValue);

  const toolbarButtonClassName =
    "rounded px-2 py-1 text-xs font-semibold text-primary-100 transition hover:bg-white/10";
  const segmentedToolbarClassName =
    "flex items-center gap-1 rounded-md border border-[#d1d5db]/35 bg-[#111b2a]/80 px-1.5 py-1";

  const stopMouseDownBlur = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onMouseDown={(event) => {
        shouldCloseOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        const shouldClose =
          shouldCloseOnBackdropRef.current && event.target === event.currentTarget;
        shouldCloseOnBackdropRef.current = false;
        if (shouldClose) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-6xl rounded-xl border border-[#d1d5db]/80 bg-[#0D1520] shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#d1d5db]/45 px-3 py-2 sm:px-4">
          <p className="text-sm font-semibold text-white">{modalTitle}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-primary-100 transition hover:bg-white/10 hover:text-white"
            aria-label={t("history.calendar.journalEditor.aria.close")}
          >
            <XIcon size={16} weight="bold" />
          </button>
        </div>

        <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
          {showDateField && dateLabel && (
            dateEditable ? (
              <DatePicker
                label={dateLabel}
                value={dateValue ?? ""}
                isOpen={datePickerOpen}
                onOpenChange={(nextIsOpen) => onDatePickerOpenChange?.(nextIsOpen)}
                onChange={(event) => onDateChange?.(event.target.value)}
              />
            ) : (
              <div className="flex flex-col gap-2 text-sm text-primary-100">
                <span className="font-medium">{dateLabel}</span>
                <div className="rounded-md border border-[#d1d5db]/45 bg-[#0D1520] px-3 py-2 text-sm text-white">
                  {dateDisplayValue || dateValue || "--"}
                </div>
              </div>
            )
          )}

          <input
            type="text"
            value={titleValue}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={titlePlaceholder}
            className="w-full rounded-md border border-[#d1d5db]/45 bg-[#0D1520] px-3 py-2 text-sm text-white placeholder:text-primary-400 focus:border-[#7AB8EC] focus:outline-none"
          />

          <div className="overflow-hidden rounded-md border border-[#d1d5db]/70 bg-[#0B1320]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#d1d5db]/45 px-2 py-1.5">
              <div className={segmentedToolbarClassName}>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={() => applyCommand("bold")} className={toolbarButtonClassName}>B</button>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={() => applyCommand("italic")} className={toolbarButtonClassName}>I</button>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={() => applyCommand("underline")} className={toolbarButtonClassName}>U</button>
              </div>

              <div className={segmentedToolbarClassName}>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={() => applyCommand("insertUnorderedList")} className={toolbarButtonClassName}>{t("history.calendar.journalEditor.toolbar.list")}</button>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={() => applyCommand("insertOrderedList")} className={toolbarButtonClassName}>{t("history.calendar.journalEditor.toolbar.numberedList")}</button>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={toggleBlockquote} className={toolbarButtonClassName}>{t("history.calendar.journalEditor.toolbar.quote")}</button>
              </div>

              <div className={segmentedToolbarClassName}>
                <button type="button" onMouseDown={stopMouseDownBlur} onClick={clearFormatting} className={toolbarButtonClassName}>{t("history.calendar.journalEditor.toolbar.clear")}</button>
              </div>

              <div className="flex items-center gap-1 rounded-md border border-[#d1d5db]/35 bg-[#111b2a]/80 px-2 py-1">
                <span className="text-[11px] font-semibold text-primary-300">{t("history.calendar.journalEditor.toolbar.color")}</span>
                {basicColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={stopMouseDownBlur}
                    onClick={() => applyColor(color)}
                    aria-label={t("history.calendar.journalEditor.aria.applyColor", { color })}
                    className="h-5 w-5 rounded-full border transition"
                    style={{
                      backgroundColor: color,
                      borderColor: activeColor === color ? "#f8fafc" : "rgba(209,213,219,0.35)",
                      boxShadow: activeColor === color ? "0 0 0 1px rgba(255,255,255,0.75)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="relative">
              {isEditorEmpty && (
                <p className="pointer-events-none absolute left-3 top-3 text-sm text-primary-500">
                  {contentPlaceholder}
                </p>
              )}

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={syncEditorContent}
                onBlur={syncEditorContent}
                onPaste={handlePaste}
                className="min-h-65 w-full bg-[#0B1320] px-3 py-3 text-sm leading-6 text-white focus:outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-primary-400/75 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || disableSave || isEditorEmpty}
              aria-label={
                mode === "edit"
                  ? t("history.calendar.journalEditor.aria.saveEdited")
                  : t("history.calendar.journalEditor.aria.saveNew")
              }
              className="inline-flex items-center gap-1 rounded-md bg-[#E1B74F] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#35280A] transition hover:brightness-110 disabled:opacity-60"
            >
              <PlusIcon size={14} weight="bold" />
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
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
    let animateFrame = 0;
    const resetFrame = window.requestAnimationFrame(() => {
      setIsAnimated(false);
      animateFrame = window.requestAnimationFrame(() => {
        setIsAnimated(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(resetFrame);
      window.cancelAnimationFrame(animateFrame);
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

function formatMoney(value: number, language = "en-US") {
  return Math.abs(value).toLocaleString(getLocale(language), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  const normalized = normalizeSessionStatus(status);
  if (
    normalized === "DRAFT" ||
    normalized === "IN_PROGRESS" ||
    normalized === "ACTIVE" ||
    normalized === "OPEN"
  ) {
    return "active";
  }

  return "completed";
}

function normalizeSessionStatus(status: string | undefined): SessionStatus {
  const normalized = (status || "").trim().toUpperCase();
  return normalized || "IN_PROGRESS";
}

function isEditableSessionStatus(status: string | undefined): boolean {
  const normalized = normalizeSessionStatus(status);
  return normalized === "IN_PROGRESS" || normalized === "DRAFT";
}

function getReplayDate(value: string | undefined | null): string | null {
  if (!value) return null;

  const directMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (directMatch) {
    return directMatch[0];
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return toISODate(parsedDate);
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
  const startDate = getReplayDate(session.startDate || session.startedAt) || getDefaultStartDate();
  const endDate = getReplayDate(session.endDate || session.endedAt);

  return {
    id: session.id,
    name: session.name,
    symbol: session.marketSymbol,
    session: normalizeSessionSlot(session.sessionSlot, session.startedAt || session.startDate),
    status: mapBackendSessionStatusToLocal(session.status),
    backendStatus: normalizeSessionStatus(session.status),
    startDate,
    endDate,
    accountBalanceStart: Number(session.accountBalanceStart ?? 0),
    accountBalanceEnd:
      session.accountBalanceEnd === null || session.accountBalanceEnd === undefined
        ? null
        : Number(session.accountBalanceEnd),
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

function getSessionsApiStatusFilter(filter: SessionsStatusFilter): SessionStatus | undefined {
  if (filter === "completed") return "COMPLETED";
  if (filter === "active") return "IN_PROGRESS";
  return undefined;
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

function formatJournalDate(value: string, language: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(getLocale(language), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatJournalTimestamp(value: string, language: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(getLocale(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function stripHtmlForPreview(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeJournalEditorContent(value: string) {
  const normalized = stripUnsafeJournalHtml(value.trim());
  return looksLikeHtmlContent(normalized)
    ? normalized
    : escapeHtml(normalized).replace(/\n/g, "<br />");
}

function toJournalEditorHtml(value: string) {
  const normalized = stripUnsafeJournalHtml(value.trim());
  if (!normalized) return "";

  return looksLikeHtmlContent(normalized)
    ? normalized
    : escapeHtml(normalized).replace(/\n/g, "<br />");
}

function isRichTextEffectivelyEmpty(value: string) {
  const plainText = value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return plainText.length === 0;
}

function stripUnsafeJournalHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+=\"[^\"]*\"/gi, "")
    .replace(/\son[a-z]+=\'[^\']*\'/gi, "")
    .replace(/\son[a-z]+=[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

function looksLikeHtmlContent(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value) || /&[a-z0-9#]+;/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

