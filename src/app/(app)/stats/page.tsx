"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { getMarketSymbols, getReferenceSessions } from "@/lib/api/reference";
import { getHistoryTrades } from "@/lib/api/history";
import {
  JOURNAL_ACCOUNT_NOT_READY_ERROR,
  createJournal,
  deleteJournal,
  getDayJournal,
  updateJournal,
} from "@/lib/api/journals";
import { getMe, tryRefreshAuthSession } from "@/lib/api/auth";
import { DatePicker } from "@/components/forms/DatePicker";
import { SelectField } from "@/components/forms/SelectField";
import { Skeleton } from "@/components/ui/Skeleton";
import { PnlDetailsPanel } from "@/components/content/PnlDetailsPanel";
import { WinnersLosersCards } from "@/components/content/WinnersLosersCards";
import { cn } from "@/lib/classNames";
import { isApiError } from "@/lib/types/api";
import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  CaretDown as CaretDownIcon,
  CaretUp as CaretUpIcon,
  PencilSimple as PencilSimpleIcon,
  Plus as PlusIcon,
  Trash as TrashIcon,
  X as XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { HistoryOutcomeCardsSummaryViewModel, HistoryTradeItemViewModel } from "@/lib/types/history";
import type { DayJournal } from "@/lib/types/journals";
import type { ReferenceSessionItem } from "@/lib/types/reference";
import type { AuthUser } from "@/lib/types/auth";
import { useAuthStore } from "@/stores/authStore";

type HistoryTrade = {
  id: string;
  date: string;
  pnl: number;
  hasPnl: boolean;
  outcome: "win" | "loss" | "open" | "breakeven";
  side?: "buy" | "sell";
  symbol: string;
  session?: "asia" | "london" | "ny";
  sessionLabel?: string;
  openedAt?: string | null;
  closedAt?: string | null;
  createdAt?: string | null;
};

type StatsWidgetId =
  | "pnl-panel"
  | "outcome-cards"
  | "performance-by-side"
  | "performance-by-session"
  | "performance-by-time"
  | "performance-by-day"
  | "performance-by-month"
  | "average-trade-frequency"
  | "trade-statistics"
  | "chart-pnl"
  | "chart-trades"
  | "chart-win-rate"
  | "chart-avg-pnl";

const STATS_LAYOUT_STORAGE_KEY = "simcorex.stats.layout.v1";

const DEFAULT_STATS_WIDGET_ORDER: StatsWidgetId[] = [
  "pnl-panel",
  "outcome-cards",
  "performance-by-side",
  "performance-by-session",
  "performance-by-time",
  "performance-by-day",
  "performance-by-month",
  "average-trade-frequency",
  "trade-statistics",
  "chart-pnl",
  "chart-trades",
  "chart-win-rate",
  "chart-avg-pnl",
];

const PERFORMANCE_BY_MONTH_INITIAL_BALANCE = 150000;
const JOURNAL_SESSION_INCONSISTENT_ERROR = "JOURNAL_SESSION_INCONSISTENT";

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const authUser = useAuthStore((state) => state.user);
  const setAuthUser = useAuthStore((state) => state.setUser);
  const clearAuthSession = useAuthStore((state) => state.clearSession);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [performanceFilter, setPerformanceFilter] = useState<"all" | "best" | "worst">("all");
  const [tradeLimit, setTradeLimit] = useState("");
  const [symbol, setSymbol] = useState("");
  const [session, setSession] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [apiTrades, setApiTrades] = useState<HistoryTrade[]>([]);
  const [apiOutcomeCards, setApiOutcomeCards] = useState<HistoryOutcomeCardsSummaryViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isLoadingReference, setIsLoadingReference] = useState(true);
  const [symbolOptions, setSymbolOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [sessionOptions, setSessionOptions] = useState<ReferenceSessionItem[]>([]);
  const [hasReferenceError, setHasReferenceError] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);
  const [draggingWidgetId, setDraggingWidgetId] = useState<StatsWidgetId | null>(null);
  const [dropTargetWidgetId, setDropTargetWidgetId] = useState<StatsWidgetId | null>(null);
  const [previewWidgetOrder, setPreviewWidgetOrder] = useState<StatsWidgetId[] | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<StatsWidgetId[]>(DEFAULT_STATS_WIDGET_ORDER);
  const [dayJournal, setDayJournal] = useState<DayJournal | null>(null);
  const [isJournalLoading, setIsJournalLoading] = useState(false);
  const [isJournalSaving, setIsJournalSaving] = useState(false);
  const [isJournalDeleting, setIsJournalDeleting] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [showConflictAction, setShowConflictAction] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalModalMode, setJournalModalMode] = useState<"create" | "edit">("create");
  const [journalTitleInput, setJournalTitleInput] = useState("");
  const [journalContentInput, setJournalContentInput] = useState("");
  const [isJournalAuthResolving, setIsJournalAuthResolving] = useState(false);
  const widgetElementRefs = useRef<Partial<Record<StatsWidgetId, HTMLElement | null>>>({});
  const previousWidgetRectsRef = useRef<Partial<Record<StatsWidgetId, DOMRect>>>({});
  const dragStartOrderRef = useRef<StatsWidgetId[] | null>(null);

  const journalAccountId = getOfficialAccountIdFromUser(authUser);
  const journalTimezone =
    authUser?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const chartColors = {
    pnl: "#1D9BF0",
    trades: "#A855F7",
    winRate: "#22C55E",
    avgPnl: "#FBBF24",
    sideBuy: "#10B981",
    sideSell: "#EF4444",
  };

  useEffect(() => {
    let cancelled = false;

    const loadReferenceData = async () => {
      setIsLoadingReference(true);
      setHasReferenceError(false);

      try {
        const [symbolsResponse, sessionsResponse] = await Promise.all([
          getMarketSymbols(),
          getReferenceSessions(),
        ]);
        if (cancelled) return;

        setSymbolOptions(
          (symbolsResponse.data ?? [])
            .filter((item) => item.active)
            .map((item) => ({ value: item.symbol, label: item.label || item.symbol }))
        );
        setSessionOptions(sessionsResponse.data ?? []);
      } catch {
        if (cancelled) return;
        setSymbolOptions([]);
        setSessionOptions([]);
        setHasReferenceError(true);
      } finally {
        if (!cancelled) {
          setIsLoadingReference(false);
        }
      }
    };

    loadReferenceData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistoryTrades = async () => {
      setIsLoading(true);
      setHasError(false);

      try {
        const response = await getHistoryTrades({
          page: 1,
          pageSize: tradeLimit ? Math.max(1, Number(tradeLimit)) : 100,
          from: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
          to: dateTo ? `${dateTo}T23:59:59.000Z` : undefined,
          symbol: symbol || undefined,
          performance:
            performanceFilter === "best"
              ? "win"
              : performanceFilter === "worst"
                ? "loss"
                : undefined,
        });

        if (cancelled) return;

        const normalizedTrades = (response.data ?? []).map(normalizeHistoryTradeFromApi);
        setApiTrades(normalizedTrades);
        setApiOutcomeCards(response.summary.outcomeCards);
      } catch {
        if (cancelled) return;
        setApiTrades([]);
        setApiOutcomeCards(null);
        setHasError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadHistoryTrades();

    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, performanceFilter, tradeLimit, symbol]);

  const hasSessionData = useMemo(
    () => apiTrades.some((trade) => Boolean(trade.session)),
    [apiTrades]
  );

  const defaultRange = useMemo(() => getDefaultRange(apiTrades), [apiTrades]);

  const filteredTrades = useMemo(() => {
    let result = apiTrades;

    if (session && hasSessionData) {
      const normalizedSelectedSession = normalizeSession(session);
      result = result.filter((trade) => {
        if (normalizedSelectedSession) {
          return trade.session === normalizedSelectedSession;
        }

        return trade.sessionLabel?.toLowerCase() === session.toLowerCase();
      });
    }

    return result;
  }, [apiTrades, session, hasSessionData]);

  const outcomeCardsForView = useMemo(() => {
    if (session && hasSessionData) return null;
    return apiOutcomeCards;
  }, [apiOutcomeCards, hasSessionData, session]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
    filteredTrades.forEach((trade) => {
      const entry = byDate.get(trade.date) ?? { pnl: 0, trades: 0, wins: 0, losses: 0 };
      entry.pnl += trade.pnl;
      entry.trades += 1;
      entry.wins += trade.outcome === "win" ? 1 : 0;
      entry.losses += trade.outcome === "loss" ? 1 : 0;
      byDate.set(trade.date, entry);
    });

    const dates = Array.from(byDate.keys()).sort();
    if (!dates.length) {
      return {
        labels: ["--"],
        pnlSeries: [0],
        tradesPerDay: [0],
        winRatePerDay: [0],
        avgPnlPerDay: [0],
      };
    }

    let running = 0;
    const labels = dates.map((date) => formatLabel(date));
    const pnlSeries = dates.map((date) => {
      running += byDate.get(date)?.pnl ?? 0;
      return running;
    });
    const tradesPerDay = dates.map((date) => byDate.get(date)?.trades ?? 0);
    const winRatePerDay = dates.map((date) => {
      const entry = byDate.get(date);
      if (!entry) return 0;
      const resolvedTrades = entry.wins + entry.losses;
      if (resolvedTrades === 0) return 0;
      return Math.round((entry.wins / resolvedTrades) * 100);
    });
    const avgPnlPerDay = dates.map((date) => {
      const entry = byDate.get(date);
      if (!entry || entry.trades === 0) return 0;
      return Math.round(entry.pnl / entry.trades);
    });

    return { labels, pnlSeries, tradesPerDay, winRatePerDay, avgPnlPerDay };
  }, [filteredTrades]);

  const sidePerformance = useMemo(
    () => buildSidePerformanceSummary(filteredTrades),
    [filteredTrades]
  );

  const sessionPerformance = useMemo(
    () => buildSessionPerformanceSummary(filteredTrades),
    [filteredTrades]
  );

  const performanceByTimeSummary = useMemo(
    () => buildPerformanceByTimeSummary(filteredTrades),
    [filteredTrades]
  );

  const performanceByDaySummary = useMemo(
    () => buildPerformanceByDaySummary(filteredTrades, i18n.language),
    [filteredTrades, i18n.language]
  );

  const performanceByMonthSummary = useMemo(
    () => buildPerformanceByMonthSummary(filteredTrades, i18n.language),
    [filteredTrades, i18n.language]
  );

  const averageTradeFrequencySummary = useMemo(
    () => buildAverageTradeFrequencySummary(filteredTrades, i18n.language),
    [filteredTrades, i18n.language]
  );

  const tradeStatsSummary = useMemo(
    () => buildTradeStatsSummary(filteredTrades, i18n.language),
    [filteredTrades, i18n.language]
  );

  const tradesByDate = useMemo(() => {
    const grouped = new Map<string, HistoryTrade[]>();
    filteredTrades.forEach((trade) => {
      const current = grouped.get(trade.date) ?? [];
      grouped.set(trade.date, [...current, trade]);
    });
    return grouped;
  }, [filteredTrades]);

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarViewDate, tradesByDate),
    [calendarViewDate, tradesByDate]
  );

  const selectedDayTrades = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return tradesByDate.get(selectedCalendarDate) ?? [];
  }, [selectedCalendarDate, tradesByDate]);

  const [hoveredDayChartPoint, setHoveredDayChartPoint] = useState<DayChartPoint | null>(null);

  const selectedDayChart = useMemo(
    () => buildDayPerformanceChart(selectedDayTrades, selectedCalendarDate),
    [selectedDayTrades, selectedCalendarDate]
  );

  const selectedDaySummary = useMemo(() => {
    const wins = selectedDayTrades.filter((trade) => trade.outcome === "win").length;
    const losses = selectedDayTrades.filter((trade) => trade.outcome === "loss").length;
    const pnl = selectedDayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    return { wins, losses, pnl };
  }, [selectedDayTrades]);

  const selectedDayTradesOrdered = useMemo(
    () =>
      [...selectedDayTrades].sort((a, b) => {
        const aTimestamp = getTradeTimestamp(a, selectedCalendarDate);
        const bTimestamp = getTradeTimestamp(b, selectedCalendarDate);
        return aTimestamp - bTimestamp;
      }),
    [selectedDayTrades, selectedCalendarDate]
  );

  const markSessionInconsistentAndLogout = useCallback(
    (operation: string, error: unknown) => {
      console.error(`[journal] ${operation} failed due to inconsistent auth session`, error);
      setJournalError(t("history.calendar.journalErrors.sessionInconsistent"));
      clearAuthSession();
    },
    [clearAuthSession, t]
  );

  const refreshOfficialAccountContext = useCallback(async () => {
    try {
      const meResponse: unknown = await getMe();
      const normalizedUser = normalizeAuthMeUser(meResponse);
      if (!normalizedUser) {
        console.error("[journal] auth/me response does not contain a valid user payload", meResponse);
        return null;
      }
      setAuthUser(normalizedUser);
      return normalizedUser;
    } catch (error) {
      console.error("[journal] failed to refresh auth/me", error);
      return null;
    }
  }, [setAuthUser]);

  const ensureOfficialJournalAccountId = useCallback(async () => {
    if (journalAccountId && isCanonicalUuid(journalAccountId)) {
      return journalAccountId;
    }

    if (!accessToken) {
      return "";
    }

    const refreshedUser = await refreshOfficialAccountContext();
    const refreshedAccountId = getOfficialAccountIdFromUser(refreshedUser);
    if (refreshedAccountId && isCanonicalUuid(refreshedAccountId)) {
      return refreshedAccountId;
    }

    return "";
  }, [accessToken, journalAccountId, refreshOfficialAccountContext]);

  const ensureJournalAuthReady = useCallback(async () => {
    const accountId = await ensureOfficialJournalAccountId();
    return Boolean(accountId);
  }, [ensureOfficialJournalAccountId]);

  const runJournalRequestWithRecovery = useCallback(
    async <T,>(operation: string, requestOperation: () => Promise<T>) => {
      try {
        return await requestOperation();
      } catch (error) {
        if (isApiError(error) && error.code === "FORBIDDEN_ACCOUNT_ACCESS") {
          const refreshedAccountId = await ensureOfficialJournalAccountId();
          if (!refreshedAccountId) {
            throw new Error(JOURNAL_SESSION_INCONSISTENT_ERROR);
          }

          try {
            return await requestOperation();
          } catch (retryError) {
            if (isApiError(retryError) && retryError.code === "FORBIDDEN_ACCOUNT_ACCESS") {
              console.error(`[journal] ${operation} retry failed with FORBIDDEN_ACCOUNT_ACCESS`, retryError);
              throw new Error(JOURNAL_SESSION_INCONSISTENT_ERROR);
            }
            throw retryError;
          }
        }

        if (isApiError(error) && (error.statusCode === 401 || error.statusCode === 403)) {
          const refreshedSession = await tryRefreshAuthSession();
          if (!refreshedSession) {
            throw new Error(JOURNAL_SESSION_INCONSISTENT_ERROR);
          }

          const refreshedAccountId = await ensureOfficialJournalAccountId();
          if (!refreshedAccountId) {
            throw new Error(JOURNAL_SESSION_INCONSISTENT_ERROR);
          }

          try {
            return await requestOperation();
          } catch (retryError) {
            if (isApiError(retryError) && (retryError.statusCode === 401 || retryError.statusCode === 403)) {
              console.error(`[journal] ${operation} retry failed with auth status`, retryError);
              throw new Error(JOURNAL_SESSION_INCONSISTENT_ERROR);
            }

            if (isApiError(retryError) && retryError.code === "FORBIDDEN_ACCOUNT_ACCESS") {
              console.error(`[journal] ${operation} retry failed with FORBIDDEN_ACCOUNT_ACCESS`, retryError);
              throw new Error(JOURNAL_SESSION_INCONSISTENT_ERROR);
            }

            throw retryError;
          }
        }

        throw error;
      }
    },
    [ensureOfficialJournalAccountId]
  );

  useEffect(() => {
    if (journalAccountId || !accessToken) return;

    let cancelled = false;
    setIsJournalAuthResolving(true);

    void (async () => {
      await refreshOfficialAccountContext();
      if (!cancelled) {
        setIsJournalAuthResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, journalAccountId, refreshOfficialAccountContext]);

  const loadDayJournal = useCallback(async () => {
    if (!selectedCalendarDate) {
      setDayJournal(null);
      setJournalError(null);
      setShowConflictAction(false);
      return;
    }

    if (isJournalAuthResolving) {
      setDayJournal(null);
      setJournalError(null);
      setShowConflictAction(false);
      return;
    }

    const authReady = await ensureJournalAuthReady();
    if (!authReady) {
      setDayJournal(null);
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      setShowConflictAction(false);
      return;
    }

    setIsJournalLoading(true);
    setJournalError(null);
    setShowConflictAction(false);

    try {
      const response = await runJournalRequestWithRecovery("loadDayJournal", () =>
        getDayJournal(selectedCalendarDate)
      );
      setDayJournal(response.data);
    } catch (error) {
      if (error instanceof Error && error.message === JOURNAL_ACCOUNT_NOT_READY_ERROR) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      if (error instanceof Error && error.message === JOURNAL_SESSION_INCONSISTENT_ERROR) {
        markSessionInconsistentAndLogout("loadDayJournal", error);
        return;
      }

      if (isAccountUuidValidationError(error)) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      setDayJournal(null);
      setJournalError(t("history.calendar.journalErrors.load"));
      console.error("[journal] failed to load day journal", error);
    } finally {
      setIsJournalLoading(false);
    }
  }, [
    ensureJournalAuthReady,
    isJournalAuthResolving,
    markSessionInconsistentAndLogout,
    runJournalRequestWithRecovery,
    selectedCalendarDate,
    t,
  ]);

  const handleOpenCreateJournal = () => {
    if (isJournalAuthResolving || !journalAccountId) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    setJournalModalMode(dayJournal ? "edit" : "create");
    setJournalTitleInput(dayJournal?.title ?? "");
    setJournalContentInput(dayJournal?.content ?? "");
    setJournalError(null);
    setShowConflictAction(false);
    setIsJournalModalOpen(true);
  };

  const handleOpenEditJournal = () => {
    if (!dayJournal) return;
    if (isJournalAuthResolving || !journalAccountId) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    setJournalModalMode("edit");
    setJournalTitleInput(dayJournal.title ?? "");
    setJournalContentInput(dayJournal.content ?? "");
    setJournalError(null);
    setShowConflictAction(false);
    setIsJournalModalOpen(true);
  };

  const handleSaveJournal = async () => {
    if (!selectedCalendarDate) return;

    if (isJournalAuthResolving) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    const authReady = await ensureJournalAuthReady();
    if (!authReady) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    const normalizedContent = normalizeJournalEditorContent(journalContentInput);
    if (isRichTextEffectivelyEmpty(normalizedContent)) {
      setJournalError(t("history.calendar.journalErrors.contentRequired"));
      return;
    }

    setIsJournalSaving(true);
    setJournalError(null);
    setShowConflictAction(false);

    try {
      if (dayJournal?.id) {
        await runJournalRequestWithRecovery("updateJournal", async () => {
          await updateJournal(dayJournal.id, {
            title: journalTitleInput.trim() ? journalTitleInput.trim() : null,
            content: normalizedContent,
            metadata: null,
          });
        });
      } else {
        await runJournalRequestWithRecovery("createJournal", async () => {
          await createJournal({
            tradingDay: selectedCalendarDate,
            timezone: journalTimezone,
            scope: "day",
            title: journalTitleInput.trim() ? journalTitleInput.trim() : null,
            content: normalizedContent,
            metadata: null,
          });
        });
      }

      setIsJournalModalOpen(false);
      await loadDayJournal();
    } catch (error) {
      if (error instanceof Error && error.message === JOURNAL_ACCOUNT_NOT_READY_ERROR) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      if (error instanceof Error && error.message === JOURNAL_SESSION_INCONSISTENT_ERROR) {
        markSessionInconsistentAndLogout("handleSaveJournal", error);
        return;
      }

      if (isAccountUuidValidationError(error)) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      if (isApiError(error) && error.code === "DAY_JOURNAL_ALREADY_EXISTS") {
        try {
          const existingJournalResponse = await runJournalRequestWithRecovery(
            "loadExistingAfterConflict",
            async () => getDayJournal(selectedCalendarDate)
          );

          if (existingJournalResponse.data) {
            setDayJournal(existingJournalResponse.data);
            setJournalModalMode("edit");
            setJournalTitleInput(existingJournalResponse.data.title ?? "");
            setJournalContentInput(existingJournalResponse.data.content ?? "");
            setShowConflictAction(false);
            setJournalError(null);
            return;
          }

          setJournalError(t("history.calendar.journalErrors.conflict"));
        } catch (conflictRecoveryError) {
          if (
            conflictRecoveryError instanceof Error &&
            conflictRecoveryError.message === JOURNAL_SESSION_INCONSISTENT_ERROR
          ) {
            markSessionInconsistentAndLogout("loadExistingAfterConflict", conflictRecoveryError);
            return;
          }

          setJournalError(t("history.calendar.journalErrors.conflict"));
          console.error("[journal] failed to recover existing journal after conflict", conflictRecoveryError);
        }

        return;
      }

      if (isApiError(error) && error.code === "INVALID_TRADING_DAY") {
        setJournalError(t("history.calendar.journalErrors.invalidTradingDay"));
        return;
      }

      if (isApiError(error) && error.code === "INVALID_TIMEZONE") {
        setJournalError(t("history.calendar.journalErrors.invalidTimezone"));
        return;
      }

      setJournalError(t("history.calendar.journalErrors.save"));
      console.error("[journal] failed to save day journal", error);
    } finally {
      setIsJournalSaving(false);
    }
  };

  const handleDeleteDayJournal = async () => {
    if (!dayJournal?.id) return;

    if (isJournalAuthResolving) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    const authReady = await ensureJournalAuthReady();
    if (!authReady) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    setIsJournalDeleting(true);
    setJournalError(null);
    setShowConflictAction(false);

    try {
      await runJournalRequestWithRecovery("deleteJournal", async () => {
        await deleteJournal(dayJournal.id);
      });
      await loadDayJournal();
    } catch (error) {
      if (error instanceof Error && error.message === JOURNAL_ACCOUNT_NOT_READY_ERROR) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      if (error instanceof Error && error.message === JOURNAL_SESSION_INCONSISTENT_ERROR) {
        markSessionInconsistentAndLogout("handleDeleteDayJournal", error);
        return;
      }

      setJournalError(t("history.calendar.journalErrors.delete"));
      console.error("[journal] failed to delete day journal", error);
    } finally {
      setIsJournalDeleting(false);
    }
  };

  const handleOpenExistingJournalFromConflict = async () => {
    if (!selectedCalendarDate) return;

    if (isJournalAuthResolving) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    const authReady = await ensureJournalAuthReady();
    if (!authReady) {
      setJournalError(t("history.calendar.journalErrors.accountMissing"));
      return;
    }

    try {
      const response = await runJournalRequestWithRecovery("openExistingJournalFromConflict", () =>
        getDayJournal(selectedCalendarDate)
      );

      if (!response.data) return;

      setDayJournal(response.data);
      setJournalModalMode("edit");
      setJournalTitleInput(response.data.title ?? "");
      setJournalContentInput(response.data.content ?? "");
      setShowConflictAction(false);
      setIsJournalModalOpen(true);
    } catch (error) {
      if (error instanceof Error && error.message === JOURNAL_ACCOUNT_NOT_READY_ERROR) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      if (error instanceof Error && error.message === JOURNAL_SESSION_INCONSISTENT_ERROR) {
        markSessionInconsistentAndLogout("handleOpenExistingJournalFromConflict", error);
        return;
      }

      if (isAccountUuidValidationError(error)) {
        setJournalError(t("history.calendar.journalErrors.accountMissing"));
        return;
      }

      setJournalError(t("history.calendar.journalErrors.load"));
      console.error("[journal] failed to open existing journal from conflict", error);
    }
  };

  useEffect(() => {
    if (!isCalendarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCalendarDate(null);
        setIsCalendarOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  useEffect(() => {
    setHoveredDayChartPoint(null);
  }, [selectedCalendarDate]);

  useEffect(() => {
    if (!selectedCalendarDate) {
      setDayJournal(null);
      setJournalError(null);
      setShowConflictAction(false);
      setIsJournalModalOpen(false);
      return;
    }

    void loadDayJournal();
  }, [journalAccountId, loadDayJournal, selectedCalendarDate]);

  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(STATS_LAYOUT_STORAGE_KEY);
      if (!savedLayout) return;

      const parsedLayout = JSON.parse(savedLayout);
      setWidgetOrder(normalizeStatsWidgetOrder(parsedLayout));
    } catch {
      setWidgetOrder(DEFAULT_STATS_WIDGET_ORDER);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STATS_LAYOUT_STORAGE_KEY, JSON.stringify(widgetOrder));
    } catch {
      // Ignore storage failures (private mode, quota, etc.)
    }
  }, [widgetOrder]);

  useEffect(() => {
    if (isLayoutEditMode) return;
    setDraggingWidgetId(null);
    setDropTargetWidgetId(null);
    setPreviewWidgetOrder(null);
  }, [isLayoutEditMode]);

  const handleOpenCalendar = () => {
    const initial = getCalendarInitialDate(filteredTrades, defaultRange.to);
    setCalendarViewDate(initial);
    setSelectedCalendarDate(null);
    setIsCalendarOpen(true);
  };

  const handleSelectCalendarDate = (date: string) => {
    setSelectedCalendarDate(date);
    setCalendarViewDate(new Date(`${date}T12:00:00`));
  };

  const handleNavigateSelectedDay = (deltaDays: number) => {
    if (!selectedCalendarDate) return;

    const baseDate = new Date(`${selectedCalendarDate}T12:00:00`);
    const nextDate = addDays(baseDate, deltaDays);
    const nextIsoDate = toISODate(nextDate);

    setSelectedCalendarDate(nextIsoDate);
    setCalendarViewDate(new Date(`${nextIsoDate}T12:00:00`));
  };

  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setPerformanceFilter("all");
    setTradeLimit("");
    setSymbol("");
    setSession("");
  };

  const clearDragState = () => {
    setDraggingWidgetId(null);
    setDropTargetWidgetId(null);
    setPreviewWidgetOrder(null);
    dragStartOrderRef.current = null;
  };

  const commitPreviewOrder = () => {
    if (!previewWidgetOrder) return;
    if (isSameWidgetOrder(previewWidgetOrder, widgetOrder)) return;
    setWidgetOrder(previewWidgetOrder);
  };

  const handleResetLayout = () => {
    setWidgetOrder(DEFAULT_STATS_WIDGET_ORDER);
    clearDragState();
  };

  const handleWidgetDragStart = (event: ReactDragEvent<HTMLDivElement>, widgetId: StatsWidgetId) => {
    if (!isLayoutEditMode) return;
    event.dataTransfer.setData("text/plain", widgetId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingWidgetId(widgetId);
    setDropTargetWidgetId(null);
    dragStartOrderRef.current = widgetOrder;
    setPreviewWidgetOrder(widgetOrder);
  };

  const handleWidgetDragOver = (event: ReactDragEvent<HTMLElement>, targetWidgetId: StatsWidgetId) => {
    if (!isLayoutEditMode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const droppedWidgetId = event.dataTransfer.getData("text/plain");
    const sourceWidgetId = isStatsWidgetId(droppedWidgetId) ? droppedWidgetId : draggingWidgetId;

    if (!sourceWidgetId || sourceWidgetId === targetWidgetId) return;
    if (dropTargetWidgetId === targetWidgetId) return;

    setDropTargetWidgetId(targetWidgetId);
    setPreviewWidgetOrder((prev) => {
      const baseOrder = dragStartOrderRef.current ?? widgetOrder;
      const currentPreview = prev ?? baseOrder;
      const nextPreview = reorderStatsWidgets(baseOrder, sourceWidgetId, targetWidgetId);
      return isSameWidgetOrder(currentPreview, nextPreview) ? currentPreview : nextPreview;
    });
  };

  const handleWidgetDrop = (event: ReactDragEvent<HTMLElement>, targetWidgetId: StatsWidgetId) => {
    if (!isLayoutEditMode) return;
    event.preventDefault();
    event.stopPropagation();

    const droppedWidgetId = event.dataTransfer.getData("text/plain");
    const sourceWidgetId = isStatsWidgetId(droppedWidgetId) ? droppedWidgetId : draggingWidgetId;

    if (previewWidgetOrder && !isSameWidgetOrder(previewWidgetOrder, widgetOrder)) {
      setWidgetOrder(previewWidgetOrder);
      clearDragState();
      return;
    }

    if (!sourceWidgetId || sourceWidgetId === targetWidgetId) {
      clearDragState();
      return;
    }

    if (previewWidgetOrder) {
      setWidgetOrder(previewWidgetOrder);
      clearDragState();
      return;
    }

    setWidgetOrder((prev) => reorderStatsWidgets(prev, sourceWidgetId, targetWidgetId));
    clearDragState();
  };

  const handleLayoutGridDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isLayoutEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    commitPreviewOrder();
    clearDragState();
  };

  const handleLayoutGridDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isLayoutEditMode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleWidgetDragEnd = () => {
    clearDragState();
  };

  const activeWidgetOrder = previewWidgetOrder ?? widgetOrder;

  useLayoutEffect(() => {
    const nextRects: Partial<Record<StatsWidgetId, DOMRect>> = {};

    activeWidgetOrder.forEach((widgetId) => {
      const element = widgetElementRefs.current[widgetId];
      if (!element) return;

      const nextRect = element.getBoundingClientRect();
      nextRects[widgetId] = nextRect;

      const previousRect = previousWidgetRectsRef.current[widgetId];
      if (!previousRect) return;

      if (draggingWidgetId || previewWidgetOrder) return;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 230,
          easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
        }
      );
    });

    previousWidgetRectsRef.current = nextRects;
  }, [activeWidgetOrder, draggingWidgetId, previewWidgetOrder]);

  const getWidgetTitle = (widgetId: StatsWidgetId) => {
    switch (widgetId) {
      case "pnl-panel":
        return t("history.pnlPanel.title");
      case "outcome-cards":
        return `${t("history.outcomeCards.winners.title")} & ${t("history.outcomeCards.losers.title")}`;
      case "performance-by-side":
        return t("history.charts.performanceBySide");
      case "performance-by-session":
        return t("history.charts.performanceBySession");
      case "performance-by-time":
        return t("history.charts.performanceByTime");
      case "performance-by-day":
        return t("history.charts.performanceByDay");
      case "performance-by-month":
        return t("history.charts.performanceByMonth");
      case "average-trade-frequency":
        return t("history.charts.averageTradeFrequency");
      case "trade-statistics":
        return t("history.charts.tradeStatistics");
      case "chart-pnl":
        return t("history.charts.pnlCumulative");
      case "chart-trades":
        return t("history.charts.tradesPerDay");
      case "chart-win-rate":
        return t("history.charts.winRateDaily");
      case "chart-avg-pnl":
        return t("history.charts.avgPnlDaily");
      default:
        return "";
    }
  };

  const getWidgetSpanClassName = (widgetId: StatsWidgetId) => {
    if (
      widgetId === "pnl-panel" ||
      widgetId === "outcome-cards" ||
      widgetId === "performance-by-side" ||
      widgetId === "performance-by-session" ||
      widgetId === "performance-by-time" ||
      widgetId === "performance-by-day" ||
      widgetId === "performance-by-month" ||
      widgetId === "average-trade-frequency" ||
      widgetId === "trade-statistics"
    ) {
      return "lg:col-span-2";
    }
    return "";
  };

  const renderWidget = (widgetId: StatsWidgetId) => {
    switch (widgetId) {
      case "pnl-panel":
        return <PnlDetailsPanel trades={filteredTrades} isLoading={isLoading} />;
      case "outcome-cards":
        return <WinnersLosersCards outcomeCards={outcomeCardsForView} isLoading={isLoading} />;
      case "performance-by-side":
        return (
          <PerformanceBySideWidget
            title={t("history.charts.performanceBySide")}
            subtitle={t("history.charts.filteredData")}
            totalTradesTitle={t("history.charts.totalTradesBySide")}
            winRateTitle={t("history.charts.winRateBySide")}
            buyLabel={t("trades.sides.buy")}
            sellLabel={t("trades.sides.sell")}
            summary={sidePerformance}
            isLoading={isLoading}
            buyColor={chartColors.sideBuy}
            sellColor={chartColors.sideSell}
            language={i18n.language}
          />
        );
      case "performance-by-session":
        return (
          <PerformanceBySessionWidget
            title={t("history.charts.performanceBySession")}
            subtitle={t("history.charts.filteredData")}
            winRateTitle={t("history.charts.sessionWinRate")}
            totalTradesTitle={t("history.charts.sessionTotalTrades")}
            avgRrTitle={t("history.charts.sessionAvgRr")}
            profitTitle={t("history.charts.sessionProfit")}
            outOfSessionLabel={t("history.charts.outOfSession")}
            asiaLabel={t("history.options.asia")}
            nyLabel={t("history.options.ny")}
            londonLabel={t("history.options.london")}
            summary={sessionPerformance}
            isLoading={isLoading}
            language={i18n.language}
          />
        );
      case "performance-by-time":
        return (
          <PerformanceByTimeWidget
            title={t("history.charts.performanceByTime")}
            subtitle={t("history.charts.filteredData")}
            metricLabel={t("history.charts.metricLabel")}
            metricTotalPnl={t("history.charts.metricTotalPnl")}
            metricTotalTrades={t("history.charts.metricTotalTrades")}
            metricWinRate={t("history.charts.metricWinRate")}
            summary={performanceByTimeSummary}
            isLoading={isLoading}
            language={i18n.language}
          />
        );
      case "performance-by-day":
        return (
          <PerformanceByDayWidget
            title={t("history.charts.performanceByDay")}
            subtitle={t("history.charts.filteredData")}
            winRateLabel={t("history.charts.dayWinRate")}
            summary={performanceByDaySummary}
            isLoading={isLoading}
            language={i18n.language}
          />
        );
      case "performance-by-month":
        return (
          <PerformanceByMonthWidget
            title={t("history.charts.performanceByMonth")}
            metricAccumSessionsGains={t("history.charts.performanceModeAccumSessionsGains")}
            metricOverallGain={t("history.charts.performanceModeOverallGain")}
            balanceInitial={t("history.charts.balanceModeInitial")}
            balanceCurrent={t("history.charts.balanceModeCurrent")}
            ytdLabel={t("history.charts.ytd")}
            totalLabel={t("history.charts.total")}
            summary={performanceByMonthSummary}
            isLoading={isLoading}
            language={i18n.language}
            initialBalance={PERFORMANCE_BY_MONTH_INITIAL_BALANCE}
          />
        );
      case "average-trade-frequency":
        return (
          <AverageTradeFrequencyWidget
            title={t("history.charts.averageTradeFrequency")}
            dayTitle={t("history.charts.tradesPerDay")}
            weekTitle={t("history.charts.tradesPerWeek")}
            monthTitle={t("history.charts.tradesPerMonth")}
            avgLabel={t("history.charts.avgShort")}
            summary={averageTradeFrequencySummary}
            isLoading={isLoading}
            language={i18n.language}
          />
        );
      case "trade-statistics":
        return (
          <TradeStatsWidget
            summary={tradeStatsSummary}
            isLoading={isLoading}
            language={i18n.language}
            labels={{
              mostActiveDay: t("history.charts.tradeStats.mostActiveDay"),
              mostProfitableDay: t("history.charts.tradeStats.mostProfitableDay"),
              leastProfitableDay: t("history.charts.tradeStats.leastProfitableDay"),
              totalTrades: t("history.charts.tradeStats.totalTrades"),
              totalLotsTraded: t("history.charts.tradeStats.totalLotsTraded"),
              avgTradeDuration: t("history.charts.tradeStats.avgTradeDuration"),
              avgWinDuration: t("history.charts.tradeStats.avgWinDuration"),
              avgLossDuration: t("history.charts.tradeStats.avgLossDuration"),
              avgWinningTrade: t("history.charts.tradeStats.avgWinningTrade"),
              avgLosingTrade: t("history.charts.tradeStats.avgLosingTrade"),
              tradeDirection: t("history.charts.tradeStats.tradeDirection"),
              bestTrade: t("history.charts.tradeStats.bestTrade"),
              worstTrade: t("history.charts.tradeStats.worstTrade"),
              activeDays: t("history.charts.tradeStats.activeDays"),
              totalTradesLabel: t("history.charts.tradeStats.totalTradesLabel"),
              avgTradesPerDay: t("history.charts.tradeStats.avgTradesPerDay"),
              buy: t("trades.sides.buy"),
              sell: t("trades.sides.sell"),
              noData: t("history.charts.tradeStats.noData"),
            }}
          />
        );
      case "chart-pnl":
        return isLoading ? (
          <ChartCardSkeleton />
        ) : (
          <ChartCard
            title={t("history.charts.pnlCumulative")}
            subtitle={t("history.charts.performanceDaily")}
            data={chartData.pnlSeries}
            labels={chartData.labels}
            color={chartColors.pnl}
            type="bar"
          />
        );
      case "chart-trades":
        return isLoading ? (
          <ChartCardSkeleton />
        ) : (
          <ChartCard
            title={t("history.charts.tradesPerDay")}
            subtitle={t("history.charts.tradesVolume")}
            data={chartData.tradesPerDay}
            labels={chartData.labels}
            color={chartColors.trades}
            type="bar"
          />
        );
      case "chart-win-rate":
        return isLoading ? (
          <ChartCardSkeleton />
        ) : (
          <ChartCard
            title={t("history.charts.winRateDaily")}
            subtitle={t("history.charts.consistency")}
            data={chartData.winRatePerDay}
            labels={chartData.labels}
            color={chartColors.winRate}
            type="bar"
          />
        );
      case "chart-avg-pnl":
        return isLoading ? (
          <ChartCardSkeleton />
        ) : (
          <ChartCard
            title={t("history.charts.avgPnlDaily")}
            subtitle={t("history.charts.effectiveness")}
            data={chartData.avgPnlPerDay}
            labels={chartData.labels}
            color={chartColors.avgPnl}
            type="bar"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("history.title")}</PageTitle>
      {hasError && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {t("history.errors.loadFailed")}
        </p>
      )}
      {hasReferenceError && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {t("history.errors.loadFailed")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleOpenCalendar}
          className="rounded-xl border border-primary-700/70 bg-primary-900/60 px-4 py-2 text-sm font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
        >
          {t("history.calendar.open")}
        </button>

        <button
          type="button"
          onClick={() => setIsFiltersOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl border border-primary-700/70 bg-primary-900/60 px-4 py-2 text-sm font-semibold text-primary-100 shadow-[0_8px_18px_rgba(15,23,42,0.28)] transition hover:border-primary-500/70 hover:text-white"
          aria-expanded={isFiltersOpen}
          aria-controls="history-filters-panel"
        >
          <span>{t("history.filtersTitle")}</span>
          {isFiltersOpen ? <CaretUpIcon size={18} weight="bold" /> : <CaretDownIcon size={18} weight="bold" />}
        </button>
      </div>

      {isFiltersOpen && (
        <div
          id="history-filters-panel"
          className="rounded-2xl bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-primary-200">{t("history.overview")}</p>
              <p className="text-lg font-semibold text-white">{t("history.filtersTitle")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: t("history.filters.all") },
                  { key: "best", label: t("history.filters.best") },
                  { key: "worst", label: t("history.filters.worst") },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPerformanceFilter(item.key)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    performanceFilter === item.key
                      ? "border-secondary-500/60 bg-secondary-500/20 text-white shadow-[0_8px_18px_rgba(34,197,94,0.2)]"
                      : "border-primary-800/80 bg-primary-950/60 text-primary-200 hover:border-primary-600/60 hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClearFilters}
                className="rounded-xl border border-primary-700/60 bg-primary-900/60 px-4 py-2 text-sm font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
              >
                {t("history.filters.clear")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DatePicker
              label={t("history.fields.dateFrom")}
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <DatePicker
              label={t("history.fields.dateTo")}
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
            <SelectField
              label={t("history.fields.topPerformance")}
              value={tradeLimit}
              onChange={(event) => setTradeLimit(event.target.value)}
              options={[
                { value: "", label: t("history.options.select") },
                { value: "10", label: t("history.options.top10") },
                { value: "20", label: t("history.options.top20") },
                { value: "50", label: t("history.options.top50") },
              ]}
            />
            {isLoadingReference ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-12.5 w-full rounded-xl" />
              </div>
            ) : (
              <SelectField
                label={t("history.fields.symbol")}
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                options={[
                  { value: "", label: t("history.options.select") },
                  ...symbolOptions,
                ]}
              />
            )}
            {isLoadingReference ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-12.5 w-full rounded-xl" />
              </div>
            ) : (
              <SelectField
                label={t("history.fields.session")}
                value={session}
                onChange={(event) => setSession(event.target.value)}
                options={[
                  { value: "", label: t("history.options.select") },
                  ...sessionOptions,
                ]}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsLayoutEditMode((prev) => !prev)}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
            isLayoutEditMode
              ? "border-amber-400/70 bg-amber-500/15 text-amber-200"
              : "border-primary-700/70 bg-primary-900/60 text-primary-100 hover:border-primary-500/70 hover:text-white"
          )}
        >
          {isLayoutEditMode ? t("history.layout.done") : t("history.layout.edit")}
        </button>

        <button
          type="button"
          onClick={handleResetLayout}
          className="rounded-xl border border-primary-700/70 bg-primary-900/60 px-4 py-2 text-sm font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
        >
          {t("history.layout.reset")}
        </button>
      </div>

      {isLayoutEditMode && (
        <p className="text-xs text-primary-300">{t("history.layout.hint")}</p>
      )}

      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        onDrop={isLayoutEditMode ? handleLayoutGridDrop : undefined}
        onDragOver={isLayoutEditMode ? handleLayoutGridDragOver : undefined}
      >
        {activeWidgetOrder.map((widgetId) => (
          <section
            key={widgetId}
            ref={(element) => {
              widgetElementRefs.current[widgetId] = element;
            }}
            onDragOver={
              isLayoutEditMode
                ? (event) => handleWidgetDragOver(event, widgetId)
                : undefined
            }
            onDrop={isLayoutEditMode ? (event) => handleWidgetDrop(event, widgetId) : undefined}
            className={cn(
              "relative transition-all duration-150",
              getWidgetSpanClassName(widgetId),
              draggingWidgetId === widgetId && "opacity-70",
              dropTargetWidgetId === widgetId &&
                draggingWidgetId !== widgetId &&
                "rounded-2xl ring-2 ring-amber-300/70"
            )}
          >
            {isLayoutEditMode && (
              <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2">
                <span className="rounded-md border border-primary-700/70 bg-primary-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-200">
                  {getWidgetTitle(widgetId)}
                </span>
                <div
                  draggable
                  role="button"
                  tabIndex={0}
                  onDragStart={(event) => handleWidgetDragStart(event, widgetId)}
                  onDragEnd={handleWidgetDragEnd}
                  className="pointer-events-auto cursor-grab rounded-md border border-primary-700/70 bg-primary-900/90 px-2 py-1 text-xs font-bold text-primary-100 active:cursor-grabbing"
                  aria-label={t("history.layout.dragAria", { section: getWidgetTitle(widgetId) })}
                >
                  ::
                </div>
              </div>
            )}

            {renderWidget(widgetId)}
          </section>
        ))}
      </div>

      {isCalendarOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-[1px] sm:p-5">
          <div className="mx-auto flex h-full max-w-450 flex-col overflow-hidden rounded-2xl border border-white/35 bg-black p-3 sm:p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary-200">{t("history.title")}</p>
                <p className="text-lg font-semibold text-white">
                  {selectedCalendarDate ? t("history.calendar.dayViewTitle") : t("history.calendar.title")}
                </p>
              </div>
              {!selectedCalendarDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCalendarDate(null);
                    setIsCalendarOpen(false);
                  }}
                  className="rounded-xl border border-white/35 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-white hover:text-white sm:px-3 sm:py-2 sm:text-sm"
                >
                  {t("history.calendar.close")}
                </button>
              )}
            </div>

            {selectedCalendarDate ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto pr-1">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 sm:px-0">
                  <button
                    type="button"
                    onClick={() => setSelectedCalendarDate(null)}
                    className="inline-flex items-center gap-1 px-1 py-1 text-xs font-semibold text-zinc-300 transition hover:text-white"
                  >
                    <ArrowLeftIcon size={14} weight="bold" />
                    {t("history.calendar.backToCalendar")}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateSelectedDay(-1)}
                      className="inline-flex items-center gap-1 px-1 py-1 text-xs font-semibold text-zinc-300 transition hover:text-white"
                    >
                      <ArrowLeftIcon size={14} weight="bold" />
                      {t("history.calendar.prevDay")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateSelectedDay(1)}
                      className="inline-flex items-center gap-1 px-1 py-1 text-xs font-semibold text-zinc-300 transition hover:text-white"
                    >
                      {t("history.calendar.nextDay")}
                      <ArrowRightIcon size={14} weight="bold" />
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/20 bg-black p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white sm:text-base">
                      {t("history.calendar.dayPerformance", {
                        date: formatCalendarIsoDate(selectedCalendarDate, i18n.language),
                      })}
                    </p>
                  </div>

                  <div className="relative">
                    <svg
                      viewBox="0 0 760 260"
                      className="h-44 w-full sm:h-56"
                      role="img"
                      aria-label="Day performance chart"
                      onMouseLeave={() => setHoveredDayChartPoint(null)}
                    >
                      <defs>
                        <linearGradient id="calendar-positive-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(74,222,128,0.65)" />
                          <stop offset="100%" stopColor="rgba(74,222,128,0.08)" />
                        </linearGradient>
                        <linearGradient id="calendar-negative-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(248,113,113,0.08)" />
                          <stop offset="100%" stopColor="rgba(248,113,113,0.62)" />
                        </linearGradient>
                      </defs>

                      <rect x="0" y="0" width="760" height="260" fill="transparent" />

                      <line x1="52" y1="218" x2="736" y2="218" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                      <line x1="52" y1={selectedDayChart.zeroY} x2="736" y2={selectedDayChart.zeroY} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" strokeWidth="1" />

                      {selectedDayChart.verticalGuides.map((guideX, index) => (
                        <line
                          key={`guide-${index}`}
                          x1={guideX}
                          y1="16"
                          x2={guideX}
                          y2="218"
                          stroke="rgba(100,116,139,0.3)"
                          strokeDasharray="3 4"
                          strokeWidth="1"
                        />
                      ))}

                      <path d={selectedDayChart.positiveAreaPath} fill="url(#calendar-positive-fill)" />
                      <path d={selectedDayChart.negativeAreaPath} fill="url(#calendar-negative-fill)" />

                      {selectedDayChart.positiveLinePaths.map((path, index) => (
                        <path key={`positive-line-${index}`} d={path} fill="none" stroke="#4ADE80" strokeWidth="2.5" />
                      ))}
                      {selectedDayChart.negativeLinePaths.map((path, index) => (
                        <path key={`negative-line-${index}`} d={path} fill="none" stroke="#F87171" strokeWidth="2.5" />
                      ))}

                      {selectedDayChart.points.map((point, index) => (
                        <g
                          key={`point-${index}`}
                          onMouseEnter={() => setHoveredDayChartPoint(point)}
                          onMouseMove={() => setHoveredDayChartPoint(point)}
                        >
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="8"
                            fill="transparent"
                            style={{ cursor: "crosshair" }}
                          />
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="2.5"
                            fill={point.value >= 0 ? "#4ADE80" : "#F87171"}
                          />
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
                            fill="rgba(0,0,0,0.96)"
                            stroke="rgba(255,255,255,0.45)"
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
                            {formatMoney(hoveredDayChartPoint.value)}
                          </text>
                        </g>
                      )}

                      {selectedDayChart.axisLabels.map((axisLabel, index) => (
                        <text
                          key={`axis-${index}`}
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

                <DayJournalPanel
                  title={t("history.calendar.dayJournal")}
                  addLabel={t("history.calendar.addJournal")}
                  noJournalLabel={t("history.calendar.noJournal")}
                  journalTitle={dayJournal?.title ?? null}
                  journalText={dayJournal?.content ?? null}
                  loading={isJournalLoading || isJournalAuthResolving}
                  saving={isJournalSaving}
                  deleting={isJournalDeleting}
                  actionsDisabled={isJournalAuthResolving || !journalAccountId}
                  onAdd={handleOpenCreateJournal}
                  onEdit={handleOpenEditJournal}
                  onDelete={handleDeleteDayJournal}
                />

                {journalError && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{journalError}</span>
                      {showConflictAction && (
                        <button
                          type="button"
                          onClick={handleOpenExistingJournalFromConflict}
                          className="rounded-md border border-red-300/50 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/15"
                        >
                          {t("history.calendar.openExisting")}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-white/20 bg-black p-3 sm:p-4">
                  <p className="text-lg font-semibold text-white sm:text-xl">
                    {t("history.calendar.trades", { count: selectedDayTradesOrdered.length })}
                  </p>

                  {selectedDayTradesOrdered.length === 0 ? (
                    <p className="mt-4 text-sm text-primary-300">{t("history.calendar.noTrades")}</p>
                  ) : (
                    <div className="mt-4 w-full overflow-x-auto rounded-xl border border-white/20">
                      <table className="w-full min-w-full border-collapse text-left text-xs sm:text-sm">
                        <thead className="bg-zinc-950 text-zinc-300">
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
                            const tradeDurationMs = getTradeDurationMs(trade);
                            const directionLabel = trade.side
                              ? trade.side.charAt(0).toUpperCase() + trade.side.slice(1)
                              : "--";

                            return (
                              <tr key={trade.id} className="border-t border-white/10 bg-black">
                                <td className="px-3 py-2 text-primary-100">{trade.id.slice(0, 10)}...</td>
                                <td className="px-3 py-2 text-white">{trade.symbol}</td>
                                <td className="px-3 py-2 text-primary-300">--</td>
                                <td className="px-3 py-2 text-primary-100">
                                  {formatCalendarDateTime(trade.openedAt, i18n.language)}
                                </td>
                                <td className="px-3 py-2 text-primary-100">
                                  {formatCalendarDateTime(trade.closedAt, i18n.language)}
                                </td>
                                <td className="px-3 py-2 text-primary-100">
                                  {tradeDurationMs !== null ? formatDuration(tradeDurationMs) : "--"}
                                </td>
                                <td className="px-3 py-2 text-primary-300">--</td>
                                <td className="px-3 py-2 text-primary-300">--</td>
                                <td className={cn("px-3 py-2 font-semibold", trade.pnl >= 0 ? "text-green-300" : "text-red-300")}>
                                  {formatMoney(trade.pnl)}
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
                    <div className="rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-zinc-100">
                      {t("history.calendar.trades", { count: selectedDayTrades.length })}
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-green-300">
                      {t("history.calendar.wins", { count: selectedDaySummary.wins })}
                    </div>
                    <div className={cn("rounded-xl border border-white/15 bg-black px-3 py-2 text-sm", selectedDaySummary.pnl >= 0 ? "text-green-300" : "text-red-300")}>
                      {t("history.summary.totalPnl")}: {formatMoney(selectedDaySummary.pnl)}
                    </div>
                  </div>
                </div>

                <JournalEditorModal
                  isOpen={isJournalModalOpen}
                  mode={journalModalMode}
                  titleValue={journalTitleInput}
                  contentValue={journalContentInput}
                  onTitleChange={setJournalTitleInput}
                  onContentChange={setJournalContentInput}
                  onClose={() => setIsJournalModalOpen(false)}
                  onSave={handleSaveJournal}
                  isSaving={isJournalSaving}
                  disableSave={isJournalAuthResolving || !journalAccountId}
                  saveLabel={t("history.calendar.saveJournal")}
                  modalTitle={
                    journalModalMode === "edit"
                      ? t("history.calendar.editJournal")
                      : t("history.calendar.addJournal")
                  }
                  titlePlaceholder={t("history.calendar.journalTitlePlaceholder")}
                  contentPlaceholder={t("history.calendar.journalContentPlaceholder")}
                />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-[#2E5C8A]/45 bg-linear-to-b from-[#17324f] to-[#13273d] p-2 sm:gap-3 sm:px-3 sm:py-2">
                  <button
                    type="button"
                    onClick={() => setCalendarViewDate((prev) => addMonths(prev, -1))}
                    className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl border border-[#2E5C8A]/70 bg-[#102238]/80 px-2 text-[11px] font-semibold text-primary-100 transition hover:border-[#4C87BA]/75 hover:text-white sm:h-auto sm:min-w-0 sm:px-3 sm:py-1.5 sm:text-xs"
                  >
                    {t("history.calendar.prev")}
                  </button>
                  <p className="rounded-xl border border-[#2E5C8A]/40 bg-[#102238]/65 px-3 py-1 text-xs font-semibold text-white sm:text-sm">
                    {formatCalendarMonthYear(calendarViewDate, i18n.language)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCalendarViewDate((prev) => addMonths(prev, 1))}
                    className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl border border-[#2E5C8A]/70 bg-[#102238]/80 px-2 text-[11px] font-semibold text-primary-100 transition hover:border-[#4C87BA]/75 hover:text-white sm:h-auto sm:min-w-0 sm:px-3 sm:py-1.5 sm:text-xs"
                  >
                    {t("history.calendar.next")}
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 rounded-xl border border-white/20 bg-black px-1.5 py-1 text-center text-[9px] uppercase tracking-[0.12em] text-zinc-400 sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-[10px] sm:tracking-[0.2em]">
                  {calendarWeekdays.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="mt-2 grid flex-1 grid-cols-7 gap-1 overflow-auto pr-1 sm:gap-2">
                  {calendarDays.map((day) => {
                    const dayValue = day.value;

                    if (day.isPlaceholder || !dayValue || !day.label) {
                      return (
                        <div
                          key={day.key}
                          className="min-h-20 rounded-2xl border border-white/30 bg-black sm:min-h-28"
                          aria-hidden
                        />
                      );
                    }

                    const hasTrades = day.stats.totalTrades > 0;
                    const isPositiveDay = day.stats.pnl > 0;
                    const isNegativeDay = day.stats.pnl < 0;
                    const dayContainerClass = !hasTrades
                      ? "bg-zinc-800"
                      : isPositiveDay
                        ? "bg-emerald-700/70"
                        : isNegativeDay
                          ? "bg-red-700/70"
                          : "bg-zinc-800";

                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => handleSelectCalendarDate(dayValue)}
                        className={cn(
                          "group relative flex min-h-20 flex-col overflow-hidden rounded-2xl border border-white/80 bg-black p-0 text-left transition-colors duration-200 hover:border-white sm:min-h-28"
                        )}
                      >
                        <div className={cn("flex h-full w-full flex-1 flex-col rounded-[15px] p-1.5 transition duration-200 group-hover:brightness-110 sm:p-2", dayContainerClass)}>
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[10px] font-semibold text-white sm:h-6 sm:w-6 sm:text-xs">
                            {day.label}
                          </span>

                          {hasTrades && (
                            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                              <p
                                className={cn(
                                  "text-xl font-extrabold leading-none sm:text-2xl",
                                  isPositiveDay
                                    ? "text-emerald-200"
                                    : isNegativeDay
                                      ? "text-rose-200"
                                      : "text-zinc-100"
                                )}
                              >
                                {formatMoney(day.stats.pnl)}
                              </p>
                              <p className="text-[10px] font-medium text-zinc-300 sm:text-xs">
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
        </div>
      )}
    </div>
  );
}

function normalizeHistoryTradeFromApi(trade: HistoryTradeItemViewModel): HistoryTrade {
  const symbol = (trade.symbol || "--").toUpperCase();
  const baseDateTime = trade.openedAt || trade.closedAt || trade.createdAt || new Date().toISOString();
  const date = baseDateTime.slice(0, 10);

  const rawPnl = trade.netPnl ?? trade.grossPnl ?? trade.pnl;
  const hasPnl = rawPnl !== undefined && rawPnl !== null && Number.isFinite(Number(rawPnl));
  const pnl = hasPnl ? Number(rawPnl) : 0;
  const sessionLabel = getSessionLabel(trade.session);
  const outcome = normalizeTradeOutcome(trade, pnl);

  return {
    id: trade.id,
    date,
    pnl,
    hasPnl,
    outcome,
    side: normalizeTradeSide(trade.side),
    symbol,
    session: normalizeSession(sessionLabel),
    sessionLabel,
    openedAt: trade.openedAt ?? null,
    closedAt: trade.closedAt ?? null,
    createdAt: trade.createdAt ?? null,
  };
}

type DayJournalPanelProps = {
  title: string;
  addLabel: string;
  noJournalLabel: string;
  journalTitle: string | null;
  journalText: string | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  actionsDisabled?: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function DayJournalPanel({
  title,
  addLabel,
  noJournalLabel,
  journalTitle,
  journalText,
  loading,
  saving,
  deleting,
  actionsDisabled = false,
  onAdd,
  onEdit,
  onDelete,
}: DayJournalPanelProps) {
  const { t } = useTranslation();
  const hasJournal = Boolean(journalText && !isRichTextEffectivelyEmpty(journalText));
  const journalHtml = journalText ? toJournalDisplayHtml(journalText) : "";

  return (
    <div className="rounded-2xl border border-white/20 bg-black p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-bold text-white sm:text-3xl">{title}</p>

        <div className="flex items-center gap-2">
          {hasJournal && (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={loading || saving || deleting || actionsDisabled}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black text-zinc-100 transition hover:border-white hover:text-white disabled:opacity-60"
                aria-label={t("history.calendar.journalEditor.aria.editButton")}
              >
                <PencilSimpleIcon size={16} weight="bold" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={loading || saving || deleting || actionsDisabled}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black text-red-300 transition hover:border-red-400/70 hover:text-red-200 disabled:opacity-60"
                aria-label={t("history.calendar.journalEditor.aria.deleteButton")}
              >
                <TrashIcon size={16} weight="bold" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onAdd}
            disabled={loading || saving || deleting || actionsDisabled || hasJournal}
            className="inline-flex items-center gap-1 rounded-lg bg-[#E1B74F] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#35280A] transition hover:brightness-110 disabled:opacity-70"
          >
            <PlusIcon size={14} weight="bold" />
            <span>{addLabel}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Skeleton mode="line" width="42%" className="bg-zinc-700/55" />
            <Skeleton mode="line" width="34%" className="bg-zinc-700/45" />
          </div>
          <div className="space-y-2">
            <Skeleton mode="line" width="100%" className="bg-zinc-700/45" />
            <Skeleton mode="line" width="88%" className="bg-zinc-700/35" />
          </div>
        </div>
      ) : hasJournal ? (
        <div className="mt-4 space-y-2">
          {journalTitle && <p className="text-base font-semibold text-white">{journalTitle}</p>}
          <div
            className="text-sm leading-6 text-zinc-100 [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-white/40 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: journalHtml }}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">{noJournalLabel}</p>
      )}
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
    "rounded px-2 py-1 text-xs font-semibold text-zinc-100 transition hover:bg-white/10";
  const segmentedToolbarClassName =
    "flex items-center gap-1 rounded-md border border-white/20 bg-black px-1.5 py-1";

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
        className="w-full max-w-6xl rounded-xl border border-white/20 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/15 px-3 py-2 sm:px-4">
          <p className="text-sm font-semibold text-white">{modalTitle}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-200 transition hover:bg-white/10 hover:text-white"
            aria-label={t("history.calendar.journalEditor.aria.close")}
          >
            <XIcon size={16} weight="bold" />
          </button>
        </div>

        <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
          <input
            type="text"
            value={titleValue}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={titlePlaceholder}
            className="w-full rounded-md border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/60 focus:outline-none"
          />

          <div className="overflow-hidden rounded-md border border-white/20 bg-black">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/15 px-2 py-1.5">
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

              <div className="flex items-center gap-1 rounded-md border border-white/20 bg-black px-2 py-1">
                <span className="text-[11px] font-semibold text-zinc-300">{t("history.calendar.journalEditor.toolbar.color")}</span>
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
                      borderColor: activeColor === color ? "#60A5FA" : "rgba(255,255,255,0.35)",
                      boxShadow: activeColor === color ? "0 0 0 1px rgba(96,165,250,0.65)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="relative">
              {isEditorEmpty && (
                <p className="pointer-events-none absolute left-3 top-3 text-sm text-zinc-500">
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
                className="min-h-65 w-full bg-black px-3 py-3 text-sm leading-6 text-white focus:outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-white/40 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
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

function toJournalDisplayHtml(value: string) {
  return toJournalEditorHtml(value);
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

function normalizeTradeOutcome(trade: HistoryTradeItemViewModel, pnl: number): HistoryTrade["outcome"] {
  const performance = (trade.performance || "").toLowerCase();
  if (performance === "win" || performance === "loss" || performance === "open" || performance === "breakeven") {
    return performance;
  }

  const status = (trade.status || "").toLowerCase();
  if (status === "open") return "open";

  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

function normalizeTradeSide(side: HistoryTradeItemViewModel["side"]): HistoryTrade["side"] {
  const normalized = (side || "").toLowerCase();
  if (normalized === "buy") return "buy";
  if (normalized === "sell") return "sell";
  return undefined;
}

function getSessionLabel(value: HistoryTradeItemViewModel["session"]) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.name || value.marketSymbol || value.id;
}

function normalizeSession(value?: string): HistoryTrade["session"] {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("asia")) return "asia";
  if (normalized.includes("london")) return "london";
  if (
    normalized === "ny" ||
    /\bny\b/.test(normalized) ||
    normalized.includes("new_york") ||
    normalized.includes("new-york") ||
    normalized.includes("new york") ||
    normalized.includes("newyork")
  ) {
    return "ny";
  }
  return undefined;
}

function ChartCardSkeleton() {
  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-6 w-48 rounded" />
        </div>
      </div>
      <Skeleton className="mt-4 h-56 w-full rounded-xl" />
    </div>
  );
}

type ChartCardProps = {
  title: string;
  subtitle: string;
  data: number[];
  labels: string[];
  color: string;
  type: "line" | "bar";
};

function ChartCard({ title, subtitle, data, labels, color, type }: ChartCardProps) {
  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div>
        <div>
          <p className="text-sm text-primary-300">{subtitle}</p>
          <p className="text-lg font-semibold text-white">{title}</p>
        </div>
      </div>

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

type SidePerformanceSummary = {
  buyTrades: number;
  sellTrades: number;
  buyTradeShare: number;
  sellTradeShare: number;
  buyWinRate: number;
  sellWinRate: number;
};

type SideChartTooltipState = {
  x: number;
  y: number;
  label: string;
  value: string;
  color: string;
};

type PerformanceBySideWidgetProps = {
  title: string;
  subtitle: string;
  totalTradesTitle: string;
  winRateTitle: string;
  buyLabel: string;
  sellLabel: string;
  summary: SidePerformanceSummary;
  isLoading: boolean;
  buyColor: string;
  sellColor: string;
  language: string;
};

function PerformanceBySideWidget({
  title,
  subtitle,
  totalTradesTitle,
  winRateTitle,
  buyLabel,
  sellLabel,
  summary,
  isLoading,
  buyColor,
  sellColor,
  language,
}: PerformanceBySideWidgetProps) {
  const [totalTradesTooltip, setTotalTradesTooltip] = useState<SideChartTooltipState | null>(null);
  const [winRateTooltip, setWinRateTooltip] = useState<SideChartTooltipState | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32 rounded" />
          <Skeleton className="h-6 w-56 rounded" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="mx-auto mt-4 h-36 w-36 rounded-full" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-full rounded" />
            </div>
          </div>
          <div className="rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="mx-auto mt-4 h-36 w-36 rounded-full" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-full rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalTradesBySide = summary.buyTrades + summary.sellTrades;
  const buyTradeShare = clampPercentage(summary.buyTradeShare);
  const sellTradeShare = clampPercentage(summary.sellTradeShare);
  const buyWinRate = clampPercentage(summary.buyWinRate);
  const sellWinRate = clampPercentage(summary.sellWinRate);
  const totalRingSize = 144;
  const totalRingThickness = 10;
  const winRateOuterSize = 144;
  const winRateOuterThickness = 12;
  const winRateInnerSize = 104;
  const winRateInnerThickness = 12;

  const totalTradesRing =
    totalTradesBySide > 0
      ? `conic-gradient(${buyColor} 0% ${buyTradeShare}%, ${sellColor} ${buyTradeShare}% 100%)`
      : "conic-gradient(rgba(148,163,184,0.38) 0% 100%)";

  const handleTotalTradesPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (totalTradesBySide <= 0) {
      setTotalTradesTooltip(null);
      return;
    }

    const pointerMetrics = getRingPointerMetrics(event);
    const outerRadius = totalRingSize / 2;
    const innerRadius = outerRadius - totalRingThickness;

    if (pointerMetrics.distance < innerRadius || pointerMetrics.distance > outerRadius) {
      setTotalTradesTooltip(null);
      return;
    }

    const buySweep = (buyTradeShare / 100) * 360;
    const isBuySide = buySweep >= 360 || pointerMetrics.angleFromTopClockwise < buySweep;
    const label = isBuySide ? buyLabel : sellLabel;
    const color = isBuySide ? buyColor : sellColor;
    const sidePercentage = isBuySide ? buyTradeShare : sellTradeShare;
    const sideTrades = isBuySide ? summary.buyTrades : summary.sellTrades;

    setTotalTradesTooltip({
      x: pointerMetrics.x,
      y: pointerMetrics.y,
      label,
      value: `${sideTrades} · ${formatPercentage(sidePercentage, language)}`,
      color,
    });
  };

  const handleWinRatePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerMetrics = getRingPointerMetrics(event);
    const outerRadius = winRateOuterSize / 2;
    const outerInnerRadius = outerRadius - winRateOuterThickness;
    const innerRadius = winRateInnerSize / 2;
    const innerInnerRadius = innerRadius - winRateInnerThickness;
    const distance = pointerMetrics.distance;

    const isInOuterRing = distance >= outerInnerRadius && distance <= outerRadius;
    const isInInnerRing = distance >= innerInnerRadius && distance <= innerRadius;

    if (!isInOuterRing && !isInInnerRing) {
      setWinRateTooltip(null);
      return;
    }

    const isBuySide = isInOuterRing;
    const label = isBuySide ? buyLabel : sellLabel;
    const color = isBuySide ? buyColor : sellColor;
    const sideWinRate = isBuySide ? buyWinRate : sellWinRate;

    setWinRateTooltip({
      x: pointerMetrics.x,
      y: pointerMetrics.y,
      label,
      value: formatPercentage(sideWinRate, language),
      color,
    });
  };

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div>
        <p className="text-sm text-primary-300">{subtitle}</p>
        <p className="text-lg font-semibold text-white">{title}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <p className="text-base font-semibold text-white">{totalTradesTitle}</p>
          <div className="mt-4 flex justify-center">
            <div
              className="relative h-36 w-36"
              onPointerMove={handleTotalTradesPointerMove}
              onPointerLeave={() => setTotalTradesTooltip(null)}
              role="img"
              aria-label={`${totalTradesTitle}: ${totalTradesBySide}`}
            >
              <div
                className="relative h-36 w-36 rounded-full p-2.5"
                style={{ backgroundImage: totalTradesRing }}
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0f172a]/92">
                  <div className="text-center">
                    <p className="text-3xl font-semibold text-white">{totalTradesBySide}</p>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-primary-300">trades</p>
                  </div>
                </div>
              </div>
              {totalTradesTooltip && <SideChartTooltipBubble tooltip={totalTradesTooltip} />}
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-primary-100">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: buyColor }} aria-hidden />
                <span>{buyLabel}</span>
              </span>
              <span className="font-semibold">{formatPercentage(buyTradeShare, language)}</span>
            </div>
            <div className="flex items-center justify-between text-primary-100">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sellColor }} aria-hidden />
                <span>{sellLabel}</span>
              </span>
              <span className="font-semibold">{formatPercentage(sellTradeShare, language)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <p className="text-base font-semibold text-white">{winRateTitle}</p>
          <div className="mt-4 flex justify-center">
            <div
              className="relative h-36 w-36"
              onPointerMove={handleWinRatePointerMove}
              onPointerLeave={() => setWinRateTooltip(null)}
              role="img"
              aria-label={`${winRateTitle}: ${buyLabel} ${formatPercentage(buyWinRate, language)} · ${sellLabel} ${formatPercentage(sellWinRate, language)}`}
            >
              <RingProgress value={buyWinRate} color={buyColor} size={144} thickness={12} />
              <div className="absolute inset-0 flex items-center justify-center">
                <RingProgress value={sellWinRate} color={sellColor} size={104} thickness={12} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-[#0f172a]/92 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-200">
                  WR
                </div>
              </div>
              {winRateTooltip && <SideChartTooltipBubble tooltip={winRateTooltip} />}
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-primary-100">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: buyColor }} aria-hidden />
                <span>{buyLabel}</span>
              </span>
              <span className="font-semibold">{formatPercentage(buyWinRate, language)}</span>
            </div>
            <div className="flex items-center justify-between text-primary-100">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sellColor }} aria-hidden />
                <span>{sellLabel}</span>
              </span>
              <span className="font-semibold">{formatPercentage(sellWinRate, language)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type SessionAxisKey = "out" | "asia" | "ny" | "london";

const SESSION_AXIS_ORDER: SessionAxisKey[] = ["out", "asia", "ny", "london"];

type SessionAxisValues = Record<SessionAxisKey, number>;

type SessionAxisLabels = Record<SessionAxisKey, string>;

type SessionMetricKind = "percent" | "count" | "ratio" | "currency";

type SessionMetricDataset = {
  normalized: SessionAxisValues;
  raw: SessionAxisValues;
  kind: SessionMetricKind;
};

type SessionPerformanceSummary = {
  winRate: SessionMetricDataset;
  totalTrades: SessionMetricDataset;
  avgRr: SessionMetricDataset;
  profit: SessionMetricDataset;
};

type PerformanceBySessionWidgetProps = {
  title: string;
  subtitle: string;
  winRateTitle: string;
  totalTradesTitle: string;
  avgRrTitle: string;
  profitTitle: string;
  outOfSessionLabel: string;
  asiaLabel: string;
  nyLabel: string;
  londonLabel: string;
  summary: SessionPerformanceSummary;
  isLoading: boolean;
  language: string;
};

function PerformanceBySessionWidget({
  title,
  subtitle,
  winRateTitle,
  totalTradesTitle,
  avgRrTitle,
  profitTitle,
  outOfSessionLabel,
  asiaLabel,
  nyLabel,
  londonLabel,
  summary,
  isLoading,
  language,
}: PerformanceBySessionWidgetProps) {
  const axisLabels: SessionAxisLabels = {
    out: outOfSessionLabel,
    asia: asiaLabel,
    ny: nyLabel,
    london: londonLabel,
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-40 rounded" />
          <Skeleton className="h-6 w-60 rounded" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`session-radar-skeleton-${index}`}
              className="rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            >
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="mx-auto mt-4 h-36 w-44 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div>
        <p className="text-sm text-primary-300">{subtitle}</p>
        <p className="text-lg font-semibold text-white">{title}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SessionRadarCard
          title={winRateTitle}
          dataset={summary.winRate}
          axisLabels={axisLabels}
          language={language}
          color="#3B82F6"
        />
        <SessionRadarCard
          title={totalTradesTitle}
          dataset={summary.totalTrades}
          axisLabels={axisLabels}
          language={language}
          color="#22C55E"
        />
        <SessionRadarCard
          title={avgRrTitle}
          dataset={summary.avgRr}
          axisLabels={axisLabels}
          language={language}
          color="#F59E0B"
        />
        <SessionRadarCard
          title={profitTitle}
          dataset={summary.profit}
          axisLabels={axisLabels}
          language={language}
          color="#14B8A6"
        />
      </div>
    </div>
  );
}

type SessionRadarCardProps = {
  title: string;
  dataset: SessionMetricDataset;
  axisLabels: SessionAxisLabels;
  language: string;
  color: string;
};

function SessionRadarCard({ title, dataset, axisLabels, language, color }: SessionRadarCardProps) {
  const [hoveredAxis, setHoveredAxis] = useState<SessionAxisKey | null>(null);
  const width = 220;
  const height = 180;
  const centerX = 110;
  const centerY = 88;
  const radius = 58;
  const axisAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const levels = [20, 40, 60, 80, 100];

  const dataPoints = SESSION_AXIS_ORDER.map((key, index) =>
    getRadarPoint(clampPercentage(dataset.normalized[key]) / 100, axisAngles[index], centerX, centerY, radius)
  );

  const labelPoints = SESSION_AXIS_ORDER.map((key, index) => ({
    key,
    point: getRadarPoint(1.18, axisAngles[index], centerX, centerY, radius),
  }));

  const axisLinePoints = SESSION_AXIS_ORDER.map((_, index) =>
    getRadarPoint(1, axisAngles[index], centerX, centerY, radius)
  );

  const hoveredAxisIndex = hoveredAxis ? SESSION_AXIS_ORDER.indexOf(hoveredAxis) : -1;
  const hoveredPoint = hoveredAxisIndex >= 0 ? dataPoints[hoveredAxisIndex] : null;
  const tooltipWidth = 112;
  const tooltipHeight = 42;
  const hoveredTooltip =
    hoveredAxis && hoveredPoint
      ? {
          label: axisLabels[hoveredAxis],
          value: formatSessionMetricValue(dataset.kind, dataset.raw[hoveredAxis], language),
          x: Math.min(width - tooltipWidth / 2, Math.max(tooltipWidth / 2, hoveredPoint.x)),
          y: hoveredPoint.y - (tooltipHeight + 10) < 0 ? hoveredPoint.y + 12 : hoveredPoint.y - (tooltipHeight + 6),
        }
      : null;

  return (
    <div className="rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <p className="text-base font-semibold text-white">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span>{title}</span>
        </span>
      </p>
      <div className="mt-3 flex justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-45 w-full max-w-56"
          role="img"
          onMouseLeave={() => setHoveredAxis(null)}
        >
          {levels.map((level) => {
            const ringPoints = axisAngles.map((angle) =>
              getRadarPoint(level / 100, angle, centerX, centerY, radius)
            );
            return (
              <polygon
                key={`session-radar-level-${level}`}
                points={toRadarPointsString(ringPoints)}
                fill="none"
                stroke="rgba(226,232,240,0.56)"
                strokeWidth={level === 100 ? 1.4 : 1}
              />
            );
          })}

          {axisLinePoints.map((point, index) => (
            <line
              key={`session-radar-axis-${SESSION_AXIS_ORDER[index]}`}
              x1={centerX}
              y1={centerY}
              x2={point.x}
              y2={point.y}
              stroke="rgba(226,232,240,0.46)"
              strokeWidth="1"
            />
          ))}

          <polygon
            points={toRadarPointsString(dataPoints)}
            fill={color}
            fillOpacity="0.22"
            stroke={color}
            strokeWidth="2"
          />

          {dataPoints.map((point, index) => {
            const sessionKey = SESSION_AXIS_ORDER[index];
            const isHovered = hoveredAxis === sessionKey;
            return (
              <g
                key={`session-radar-point-${sessionKey}`}
                onMouseEnter={() => setHoveredAxis(sessionKey)}
                className="cursor-pointer"
              >
                <circle cx={point.x} cy={point.y} r={11} fill="transparent" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isHovered ? 5 : 4}
                  fill={color}
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {labelPoints.map(({ key, point }) => (
            <text
              key={`session-radar-label-${key}`}
              x={point.x}
              y={point.y}
              fill="rgba(226,232,240,0.84)"
              fontSize="11"
              textAnchor={key === "asia" ? "start" : key === "london" ? "end" : "middle"}
              dominantBaseline={key === "out" ? "auto" : "middle"}
            >
              {axisLabels[key]}
            </text>
          ))}

          {hoveredTooltip && (
            <g
              transform={`translate(${hoveredTooltip.x - tooltipWidth / 2} ${hoveredTooltip.y})`}
              pointerEvents="none"
            >
              <rect
                width={tooltipWidth}
                height={tooltipHeight}
                rx="10"
                fill="#1B314B"
                stroke="rgba(46,92,138,0.65)"
              />
              <circle cx="10" cy="13" r="3.5" fill={color} />
              <text x="18" y="16" fill="#FFFFFF" fontSize="11" fontWeight="700">
                {hoveredTooltip.label}
              </text>
              <text x="10" y="31" fill="rgba(225,226,228,0.92)" fontSize="11">
                {hoveredTooltip.value}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function formatSessionMetricValue(kind: SessionMetricKind, value: number, language: string) {
  const locale = getLocale(language);

  if (kind === "percent") {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Math.max(0, value))}%`;
  }

  if (kind === "count") {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(Math.max(0, value));
  }

  if (kind === "ratio") {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.max(0, value))}R`;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function getRadarPoint(ratio: number, angle: number, centerX: number, centerY: number, radius: number) {
  return {
    x: centerX + Math.cos(angle) * radius * ratio,
    y: centerY + Math.sin(angle) * radius * ratio,
  };
}

function toRadarPointsString(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

type PerformanceByTimeMetricKey = "totalPnl" | "totalTrades" | "winRate";

type PerformanceByTimeSummary = {
  hours: string[];
  totalPnl: number[];
  totalTrades: number[];
  winRate: number[];
};

type PerformanceByDayRow = {
  dayIndex: number;
  dayLabel: string;
  pnl: number;
  winRate: number | null;
};

type PerformanceByDaySummary = {
  rows: PerformanceByDayRow[];
};

type PerformanceByMonthGainMode = "accumSessionsGains" | "overallGain";

type PerformanceByMonthBalanceMode = "initialBalance" | "currentBalance";

type PerformanceByMonthYearBucket = {
  year: number;
  monthlyPnl: number[];
  hasTrade: boolean[];
};

type PerformanceByMonthSummary = {
  monthLabels: string[];
  years: PerformanceByMonthYearBucket[];
};

type PerformanceByMonthDisplayRow = {
  year: number;
  values: Array<number | null>;
  ytd: number | null;
};

type PerformanceByMonthDisplay = {
  rows: PerformanceByMonthDisplayRow[];
  totalYtd: number | null;
};

type AverageTradeFrequencyBucket = {
  label: string;
  value: number;
};

type AverageTradeFrequencySummary = {
  dayBuckets: AverageTradeFrequencyBucket[];
  weekBuckets: AverageTradeFrequencyBucket[];
  monthBuckets: AverageTradeFrequencyBucket[];
  dayAverage: number;
  weekAverage: number;
  monthAverage: number;
};

type PerformanceByTimeWidgetProps = {
  title: string;
  subtitle: string;
  metricLabel: string;
  metricTotalPnl: string;
  metricTotalTrades: string;
  metricWinRate: string;
  summary: PerformanceByTimeSummary;
  isLoading: boolean;
  language: string;
};

function PerformanceByTimeWidget({
  title,
  subtitle,
  metricLabel,
  metricTotalPnl,
  metricTotalTrades,
  metricWinRate,
  summary,
  isLoading,
  language,
}: PerformanceByTimeWidgetProps) {
  const [selectedMetric, setSelectedMetric] = useState<PerformanceByTimeMetricKey>("totalPnl");
  const [hoveredHourIndex, setHoveredHourIndex] = useState<number | null>(null);

  const metricOptions: Array<{ value: PerformanceByTimeMetricKey; label: string }> = [
    { value: "totalPnl", label: metricTotalPnl },
    { value: "totalTrades", label: metricTotalTrades },
    { value: "winRate", label: metricWinRate },
  ];

  const activeSeries =
    selectedMetric === "totalPnl"
      ? summary.totalPnl
      : selectedMetric === "totalTrades"
        ? summary.totalTrades
        : summary.winRate;

  const chartWidth = 980;
  const chartHeight = 240;
  const paddingLeft = 58;
  const paddingRight = 16;
  const paddingTop = 14;
  const paddingBottom = 30;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const barSlotWidth = summary.hours.length > 0 ? innerWidth / summary.hours.length : 0;
  const barWidth = Math.min(30, Math.max(8, barSlotWidth * 0.55));

  const metricBounds = useMemo(() => {
    if (selectedMetric === "winRate") {
      return {
        min: 0,
        max: 100,
      };
    }

    if (selectedMetric === "totalTrades") {
      return {
        min: 0,
        max: Math.max(1, ...activeSeries),
      };
    }

    const rawMin = Math.min(0, ...activeSeries);
    const rawMax = Math.max(0, ...activeSeries);
    const spread = Math.max(1, rawMax - rawMin);

    return {
      min: rawMin - spread * 0.08,
      max: rawMax + spread * 0.08,
    };
  }, [activeSeries, selectedMetric]);

  const valueRange = Math.max(1, metricBounds.max - metricBounds.min);
  const zeroY = paddingTop + ((metricBounds.max - 0) / valueRange) * innerHeight;

  const yTicks = useMemo(() => {
    const tickCount = 6;
    return Array.from({ length: tickCount }, (_, index) => {
      const ratio = index / (tickCount - 1);
      const value = metricBounds.max - ratio * valueRange;
      const y = paddingTop + ratio * innerHeight;
      return { value, y };
    });
  }, [innerHeight, metricBounds.max, paddingTop, valueRange]);

  const hoveredTooltip =
    hoveredHourIndex !== null
      ? {
          hour: summary.hours[hoveredHourIndex],
          value: activeSeries[hoveredHourIndex],
          x: paddingLeft + barSlotWidth * hoveredHourIndex + barSlotWidth / 2,
          y:
            paddingTop + ((metricBounds.max - activeSeries[hoveredHourIndex]) / valueRange) * innerHeight,
        }
      : null;

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-52 rounded" />
          </div>
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
        <div className="mt-4 rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-primary-300">{subtitle}</p>
          <p className="text-lg font-semibold text-white">{title}</p>
        </div>

        <div className="relative">
          <label htmlFor="performance-by-time-metric" className="sr-only">
            {metricLabel}
          </label>
          <select
            id="performance-by-time-metric"
            value={selectedMetric}
            onChange={(event) => setSelectedMetric(event.target.value as PerformanceByTimeMetricKey)}
            className="appearance-none rounded-xl border border-primary-700/70 bg-primary-950/70 py-2 pl-3 pr-10 text-sm font-semibold text-white outline-none transition hover:border-primary-500/80 focus:border-primary-500/90"
          >
            {metricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <CaretDownIcon
            size={16}
            weight="bold"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-primary-200"
            aria-hidden
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="overflow-x-auto">
          <div className="min-w-245">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-64 w-full"
              role="img"
              onMouseLeave={() => setHoveredHourIndex(null)}
            >
              {yTicks.map((tick) => (
                <g key={`performance-time-tick-${tick.y}`}>
                  <line
                    x1={paddingLeft}
                    y1={tick.y}
                    x2={chartWidth - paddingRight}
                    y2={tick.y}
                    stroke="rgba(148,163,184,0.35)"
                    strokeDasharray="6 8"
                  />
                  <text x={6} y={tick.y + 4} fill="rgba(203,213,225,0.78)" fontSize="11">
                    {formatPerformanceByTimeAxisValue(selectedMetric, tick.value, language)}
                  </text>
                </g>
              ))}

              <line
                x1={paddingLeft}
                y1={zeroY}
                x2={chartWidth - paddingRight}
                y2={zeroY}
                stroke="rgba(148,163,184,0.55)"
                strokeWidth="1"
              />

              {activeSeries.map((value, index) => {
                const centerX = paddingLeft + barSlotWidth * index + barSlotWidth / 2;
                const barX = centerX - barWidth / 2;
                const valueY = paddingTop + ((metricBounds.max - value) / valueRange) * innerHeight;
                const y = value >= 0 ? valueY : zeroY;
                const height = Math.max(2, Math.abs(valueY - zeroY));

                const isNegative = value < 0;
                const barColor =
                  selectedMetric === "totalPnl"
                    ? isNegative
                      ? "#F87171"
                      : "#34D399"
                    : selectedMetric === "totalTrades"
                      ? "#3B82F6"
                      : "#F59E0B";

                return (
                  <g
                    key={`performance-time-bar-${summary.hours[index]}`}
                    onMouseEnter={() => setHoveredHourIndex(index)}
                    className="cursor-pointer"
                  >
                    <rect x={barX} y={y} width={barWidth} height={height} rx={3} fill={barColor} opacity="0.24" />
                    <rect
                      x={barX}
                      y={y + 1}
                      width={barWidth}
                      height={Math.max(1, height - 1)}
                      rx={3}
                      fill={barColor}
                      opacity="0.78"
                    />
                  </g>
                );
              })}

              {summary.hours.map((hour, index) => {
                const x = paddingLeft + barSlotWidth * index + barSlotWidth / 2;
                return (
                  <text
                    key={`performance-time-hour-${hour}`}
                    x={x}
                    y={chartHeight - 8}
                    fill="rgba(203,213,225,0.78)"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {hour}
                  </text>
                );
              })}

              {hoveredTooltip && (
                <g pointerEvents="none">
                  <rect
                    x={Math.min(chartWidth - 150, Math.max(paddingLeft, hoveredTooltip.x - 70))}
                    y={Math.max(8, hoveredTooltip.y - 56)}
                    width="140"
                    height="44"
                    rx="10"
                    fill="#1B314B"
                    stroke="rgba(46,92,138,0.7)"
                  />
                  <text
                    x={Math.min(chartWidth - 138, Math.max(paddingLeft + 10, hoveredTooltip.x - 60))}
                    y={Math.max(25, hoveredTooltip.y - 38)}
                    fill="#FFFFFF"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {hoveredTooltip.hour}
                  </text>
                  <text
                    x={Math.min(chartWidth - 138, Math.max(paddingLeft + 10, hoveredTooltip.x - 60))}
                    y={Math.max(41, hoveredTooltip.y - 22)}
                    fill="rgba(225,226,228,0.92)"
                    fontSize="11"
                  >
                    {formatPerformanceByTimeTooltipValue(selectedMetric, hoveredTooltip.value, language)}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

type PerformanceByDayWidgetProps = {
  title: string;
  subtitle: string;
  winRateLabel: string;
  summary: PerformanceByDaySummary;
  isLoading: boolean;
  language: string;
};

type PerformanceByMonthWidgetProps = {
  title: string;
  metricAccumSessionsGains: string;
  metricOverallGain: string;
  balanceInitial: string;
  balanceCurrent: string;
  ytdLabel: string;
  totalLabel: string;
  summary: PerformanceByMonthSummary;
  isLoading: boolean;
  language: string;
  initialBalance: number;
};

type AverageTradeFrequencyWidgetProps = {
  title: string;
  dayTitle: string;
  weekTitle: string;
  monthTitle: string;
  avgLabel: string;
  summary: AverageTradeFrequencySummary;
  isLoading: boolean;
  language: string;
};

function PerformanceByDayWidget({
  title,
  subtitle,
  winRateLabel,
  summary,
  isLoading,
  language,
}: PerformanceByDayWidgetProps) {
  const chartWidth = 980;
  const chartHeight = 260;
  const paddingLeft = 70;
  const paddingRight = 18;
  const paddingTop = 14;
  const paddingBottom = 38;
  const badgeAreaWidth = 58;
  const rows = summary.rows;
  const rowHeight = rows.length > 0 ? (chartHeight - paddingTop - paddingBottom) / rows.length : 0;
  const axisStartX = paddingLeft + 4;
  const axisEndX = chartWidth - paddingRight - badgeAreaWidth;

  const xForPercentage = (value: number) => {
    const boundedValue = Math.max(0, Math.min(100, value));
    return axisStartX + (boundedValue / 100) * (axisEndX - axisStartX);
  };

  const ticks = Array.from({ length: 6 }, (_, index) => {
    const value = index * 20;
    const x = xForPercentage(value);
    return { value, x };
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Skeleton className="h-5 w-52 rounded" />
          </div>
          <Skeleton className="h-5 w-20 rounded" />
        </div>
        <div className="mt-4 rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-primary-300">{subtitle}</p>
          <p className="text-lg font-semibold text-white">{title}</p>
        </div>
        <p className="text-sm font-semibold text-primary-200">{winRateLabel}</p>
      </div>

      <div className="mt-4 rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="overflow-x-auto">
          <div className="min-w-240">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-66 w-full" role="img">
              {rows.map((row, index) => {
                const yCenter = paddingTop + rowHeight * index + rowHeight / 2;
                return (
                  <line
                    key={`performance-day-grid-${row.dayIndex}`}
                    x1={axisStartX}
                    y1={yCenter}
                    x2={axisEndX}
                    y2={yCenter}
                    stroke="rgba(148,163,184,0.35)"
                    strokeDasharray="6 8"
                  />
                );
              })}

              {rows.map((row, index) => {
                const yCenter = paddingTop + rowHeight * index + rowHeight / 2;
                const winRate = row.winRate ?? 0;
                const valueX = xForPercentage(winRate);
                const barX = axisStartX;
                const barWidth = winRate > 0 ? Math.max(2, valueX - axisStartX) : 0;
                const barHeight = Math.max(10, rowHeight * 0.66);

                return (
                  <g key={`performance-day-bar-${row.dayIndex}`}>
                    <text
                      x={14}
                      y={yCenter + 4}
                      fill="rgba(203,213,225,0.84)"
                      fontSize="11"
                    >
                      {row.dayLabel}
                    </text>

                    <rect
                      x={barX}
                      y={yCenter - barHeight / 2}
                      width={barWidth}
                      height={barHeight}
                      rx="4"
                      fill="#14B8A6"
                      opacity="0.82"
                    />

                    {row.winRate !== null && (
                      <g>
                        <rect
                          x={axisEndX + 10}
                          y={yCenter - 10}
                          width="40"
                          height="20"
                          rx="6"
                          fill="#14B8A6"
                          opacity="0.92"
                        />
                        <text
                          x={axisEndX + 30}
                          y={yCenter + 4}
                          fill="#F8FAFC"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {formatPerformanceByDayWinRate(row.winRate, language)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {ticks.map((tick) => (
                <g key={`performance-day-tick-${tick.x}`}>
                  <line
                    x1={tick.x}
                    y1={chartHeight - paddingBottom}
                    x2={tick.x}
                    y2={chartHeight - paddingBottom + 6}
                    stroke="rgba(148,163,184,0.5)"
                    strokeWidth="1"
                  />
                  <text
                    x={tick.x}
                    y={chartHeight - 8}
                    fill="rgba(203,213,225,0.74)"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {formatPerformanceByDayAxisValue(tick.value, language)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function PerformanceByMonthWidget({
  title,
  metricAccumSessionsGains,
  metricOverallGain,
  balanceInitial,
  balanceCurrent,
  ytdLabel,
  totalLabel,
  summary,
  isLoading,
  language,
  initialBalance,
}: PerformanceByMonthWidgetProps) {
  const [gainMode, setGainMode] = useState<PerformanceByMonthGainMode>("accumSessionsGains");
  const [balanceMode, setBalanceMode] = useState<PerformanceByMonthBalanceMode>("initialBalance");

  const display = useMemo(
    () => buildPerformanceByMonthDisplay(summary, gainMode, balanceMode, initialBalance),
    [summary, gainMode, balanceMode, initialBalance]
  );

  const hasRows = summary.years.length > 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-6 w-52 rounded" />
          <Skeleton className="h-6 w-44 rounded" />
        </div>
        <div className="mt-4 rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-semibold text-white">{title}</p>
          <div className="inline-flex items-center gap-3 text-xs font-semibold text-primary-100">
            <button
              type="button"
              onClick={() => setBalanceMode("initialBalance")}
              className={cn(
                "inline-flex items-center gap-2 px-1 py-0.5 transition",
                balanceMode === "initialBalance" ? "text-white" : "text-primary-200 hover:text-white"
              )}
            >
              <span
                className={cn(
                  "h-3.5 w-3.5 rounded-full border",
                  balanceMode === "initialBalance"
                    ? "border-[#60A5FA] bg-[#60A5FA]"
                    : "border-primary-500/70 bg-transparent"
                )}
                aria-hidden
              />
              {balanceInitial}
            </button>
            <button
              type="button"
              onClick={() => setBalanceMode("currentBalance")}
              className={cn(
                "inline-flex items-center gap-2 px-1 py-0.5 transition",
                balanceMode === "currentBalance" ? "text-white" : "text-primary-200 hover:text-white"
              )}
            >
              <span
                className={cn(
                  "h-3.5 w-3.5 rounded-full border",
                  balanceMode === "currentBalance"
                    ? "border-[#60A5FA] bg-[#60A5FA]"
                    : "border-primary-500/70 bg-transparent"
                )}
                aria-hidden
              />
              {balanceCurrent}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-primary-100">
          <button
            type="button"
            onClick={() => setGainMode("accumSessionsGains")}
            className={cn(
              "inline-flex items-center gap-2 px-1 py-0.5 transition",
              gainMode === "accumSessionsGains" ? "text-white" : "text-primary-200 hover:text-white"
            )}
          >
            <span
              className={cn(
                "h-3.5 w-3.5 rounded-full border",
                gainMode === "accumSessionsGains"
                  ? "border-[#60A5FA] bg-[#60A5FA]"
                  : "border-primary-500/70 bg-transparent"
              )}
              aria-hidden
            />
            {metricAccumSessionsGains}
          </button>
          <button
            type="button"
            onClick={() => setGainMode("overallGain")}
            className={cn(
              "inline-flex items-center gap-2 px-1 py-0.5 transition",
              gainMode === "overallGain" ? "text-white" : "text-primary-200 hover:text-white"
            )}
          >
            <span
              className={cn(
                "h-3.5 w-3.5 rounded-full border",
                gainMode === "overallGain"
                  ? "border-[#60A5FA] bg-[#60A5FA]"
                  : "border-primary-500/70 bg-transparent"
              )}
              aria-hidden
            />
            {metricOverallGain}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="overflow-x-auto">
          <div className="min-w-240">
            <div className="overflow-hidden rounded-2xl border border-primary-700/60">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-primary-900/80">
                    <th className="w-16 border border-primary-700/45 px-2 py-2" />
                    {summary.monthLabels.map((monthLabel) => (
                      <th
                        key={`performance-month-head-${monthLabel}`}
                        className="min-w-15 border border-primary-700/45 px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-primary-100"
                      >
                        {monthLabel}
                      </th>
                    ))}
                    <th className="min-w-15 border border-primary-700/45 px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-primary-100">
                      {ytdLabel}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {display.rows.map((row) => (
                    <tr key={`performance-month-row-${row.year}`} className="bg-primary-900/55">
                      <td className="border border-primary-700/45 bg-primary-900/80 px-2 py-2 text-center text-sm font-semibold text-primary-100">
                        {row.year}
                      </td>

                      {row.values.map((value, monthIndex) => (
                        <td
                          key={`performance-month-cell-${row.year}-${monthIndex}`}
                          className="min-w-15 border border-primary-700/45 px-2 py-2 text-center text-[11px] font-semibold"
                        >
                          <span
                            className={cn(
                              value === null
                                ? "text-primary-300"
                                : value >= 0
                                  ? "text-emerald-300"
                                  : "text-rose-300"
                            )}
                          >
                            {formatPerformanceByMonthPercentage(value, language)}
                          </span>
                        </td>
                      ))}

                      <td className="min-w-15 border border-primary-700/45 px-2 py-2 text-center text-[11px] font-semibold">
                        <span
                          className={cn(
                            row.ytd === null
                              ? "text-primary-300"
                              : row.ytd >= 0
                                ? "text-emerald-300"
                                : "text-rose-300"
                          )}
                        >
                          {formatPerformanceByMonthPercentage(row.ytd, language)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {hasRows && (
                  <tfoot>
                    <tr className="bg-primary-900/70">
                      <td
                        colSpan={summary.monthLabels.length + 1}
                        className="border border-primary-700/45 px-3 py-2 text-right text-[11px] font-semibold text-primary-100"
                      >
                        {totalLabel}
                      </td>
                      <td className="min-w-15 border border-primary-700/45 px-2 py-2 text-center text-[11px] font-semibold">
                        <span
                          className={cn(
                            display.totalYtd === null
                              ? "text-primary-300"
                              : display.totalYtd >= 0
                                ? "text-emerald-300"
                                : "text-rose-300"
                          )}
                        >
                          {formatPerformanceByMonthPercentage(display.totalYtd, language)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {!hasRows && (
              <p className="px-2 py-4 text-sm text-primary-300">--</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AverageTradeFrequencyWidget({
  title,
  dayTitle,
  weekTitle,
  monthTitle,
  avgLabel,
  summary,
  isLoading,
  language,
}: AverageTradeFrequencyWidgetProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <Skeleton className="h-6 w-56 rounded" />
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Skeleton className="h-70 w-full rounded-2xl" />
          <Skeleton className="h-70 w-full rounded-2xl" />
          <Skeleton className="h-70 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex items-center gap-2">
        <p className="text-lg font-semibold text-white">{title}</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-240 grid-cols-1 gap-3 lg:grid-cols-3">
          <AverageTradeFrequencyMiniChart
            title={dayTitle}
            avgLabel={avgLabel}
            avgValue={summary.dayAverage}
            buckets={summary.dayBuckets}
            language={language}
            barColor="#1D9BF0"
          />
          <AverageTradeFrequencyMiniChart
            title={weekTitle}
            avgLabel={avgLabel}
            avgValue={summary.weekAverage}
            buckets={summary.weekBuckets}
            language={language}
            barColor="#0EA5E9"
          />
          <AverageTradeFrequencyMiniChart
            title={monthTitle}
            avgLabel={avgLabel}
            avgValue={summary.monthAverage}
            buckets={summary.monthBuckets}
            language={language}
            barColor="#2563EB"
          />
        </div>
      </div>
    </div>
  );
}

type AverageTradeFrequencyMiniChartProps = {
  title: string;
  avgLabel: string;
  avgValue: number;
  buckets: AverageTradeFrequencyBucket[];
  language: string;
  barColor: string;
};

function AverageTradeFrequencyMiniChart({
  title,
  avgLabel,
  avgValue,
  buckets,
  language,
  barColor,
}: AverageTradeFrequencyMiniChartProps) {
  const [hoveredBucketIndex, setHoveredBucketIndex] = useState<number | null>(null);
  const chartWidth = 320;
  const chartHeight = 210;
  const paddingLeft = 36;
  const paddingRight = 10;
  const paddingTop = 24;
  const paddingBottom = 36;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const maxValueRaw = Math.max(1, ...buckets.map((bucket) => bucket.value));
  const step =
    maxValueRaw <= 10 ? 2 : maxValueRaw <= 50 ? 10 : maxValueRaw <= 250 ? 50 : Math.ceil(maxValueRaw / 6 / 10) * 10;
  const yMax = Math.max(step * 5, Math.ceil(maxValueRaw / step) * step);

  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value = index * (yMax / 5);
    const y = paddingTop + innerHeight - (value / yMax) * innerHeight;
    return { value, y };
  });

  const slotWidth = buckets.length > 0 ? innerWidth / buckets.length : innerWidth;
  const barWidth = Math.min(12, Math.max(6, slotWidth * 0.28));

  return (
    <div className="relative rounded-2xl bg-primary-900/60 p-3 sm:p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-semibold leading-none text-white">{title}</p>
        <p className="text-lg font-semibold leading-none text-primary-100">
          {avgLabel} {formatAverageTradeFrequencyValue(avgValue, language)}
        </p>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mt-3 h-52 w-full" role="img">
        {yTicks.map((tick) => (
          <g key={`${title}-y-tick-${tick.value}`}>
            <line
              x1={paddingLeft}
              y1={tick.y}
              x2={chartWidth - paddingRight}
              y2={tick.y}
              stroke="rgba(148,163,184,0.35)"
              strokeDasharray="6 8"
            />
            <text x={paddingLeft - 8} y={tick.y + 3} fill="rgba(203,213,225,0.66)" fontSize="10" textAnchor="end">
              {new Intl.NumberFormat(getLocale(language), { maximumFractionDigits: 0 }).format(tick.value)}
            </text>
          </g>
        ))}

        {buckets.map((bucket, index) => {
          const x = paddingLeft + slotWidth * index + slotWidth / 2 - barWidth / 2;
          const barHeight = (bucket.value / yMax) * innerHeight;
          const y = paddingTop + innerHeight - barHeight;
          const isHovered = hoveredBucketIndex === index;

          return (
            <g
              key={`${title}-bar-${bucket.label}`}
              onMouseEnter={() => setHoveredBucketIndex(index)}
              onMouseLeave={() => setHoveredBucketIndex(null)}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(1, barHeight)}
                rx="2"
                fill={barColor}
                opacity={isHovered ? "1" : "0.9"}
              />
              <text
                x={paddingLeft + slotWidth * index + slotWidth / 2}
                y={chartHeight - 10}
                fill="rgba(203,213,225,0.74)"
                fontSize="10"
                textAnchor="middle"
              >
                {bucket.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredBucketIndex !== null && buckets[hoveredBucketIndex] && (
        <div className="pointer-events-none absolute right-3 top-14 z-10 rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
          <div className="font-semibold">{buckets[hoveredBucketIndex].label}</div>
          <div className="text-primary-100">
            {new Intl.NumberFormat(getLocale(language), { maximumFractionDigits: 0 }).format(
              buckets[hoveredBucketIndex].value
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trade Statistics Widget ──────────────────────────────────────────────────

type TradeStatsWidgetLabels = {
  mostActiveDay: string;
  mostProfitableDay: string;
  leastProfitableDay: string;
  totalTrades: string;
  totalLotsTraded: string;
  avgTradeDuration: string;
  avgWinDuration: string;
  avgLossDuration: string;
  avgWinningTrade: string;
  avgLosingTrade: string;
  tradeDirection: string;
  bestTrade: string;
  worstTrade: string;
  activeDays: string;
  totalTradesLabel: string;
  avgTradesPerDay: string;
  buy: string;
  sell: string;
  noData: string;
};

function TradeStatsWidget({
  summary,
  isLoading,
  language,
  labels,
}: {
  summary: TradeStatsSummary;
  isLoading: boolean;
  language: string;
  labels: TradeStatsWidgetLabels;
}) {
  const fmt = (value: number, signed = false) =>
    new Intl.NumberFormat(getLocale(language), {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: signed ? "always" : "auto",
    }).format(value);

  const fmtNum = (value: number) =>
    new Intl.NumberFormat(getLocale(language), { maximumFractionDigits: 2 }).format(value);

  const pnlColor = (v: number) => (v >= 0 ? "text-emerald-400" : "text-red-400");

  const cardBase =
    "flex flex-col gap-1 rounded-2xl bg-primary-900/60 px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]";

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={cardBase}>
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="mt-2 h-6 w-32 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (summary.totalTrades === 0) {
    return (
      <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex items-center justify-center py-10 text-sm text-primary-300">
          {labels.noData}
        </div>
      </div>
    );
  }

  const totalSided = summary.buyCount + summary.sellCount;
  const buyPct = totalSided > 0 ? (summary.buyCount / totalSided) * 100 : 0;
  const sellPct = 100 - buyPct;
  void sellPct;

  // Ring chart for direction
  const ringR = 36;
  const ringCircumference = 2 * Math.PI * ringR;
  const buyArc = (buyPct / 100) * ringCircumference;

  const formatBestWorstSubtitle = (trade: TradeStatsSummary["bestTrade"]) => {
    if (!trade) return "";
    const sideLabel = trade.side
      ? trade.side.charAt(0).toUpperCase() + trade.side.slice(1)
      : "—";
    const sym = trade.symbol ?? "—";
    const date =
      trade.openedAt
        ? new Date(trade.openedAt).toLocaleString(getLocale(language), {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "—";
    return `${sideLabel} / ${sym}\n${date}`;
  };

  return (
    <div className="rounded-2xl bg-primary-900/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-col gap-3">
      {/* Row 1: Most Active / Profitable / Least Profitable */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Most Active Day */}
        <div className={`${cardBase} sm:col-span-1`}>
          <span className="text-xs font-medium text-primary-300">{labels.mostActiveDay}</span>
          {summary.mostActiveDay ? (
            <>
              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-bold text-white">
                  {summary.mostActiveDay.dayName}
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5 text-xs text-primary-300">
                <span>
                  {summary.mostActiveDay.activeDays} {labels.activeDays}
                </span>
                <span>
                  {summary.mostActiveDay.totalTrades} {labels.totalTradesLabel}
                </span>
                <span>
                  {fmtNum(summary.mostActiveDay.avgTradesPerDay)} {labels.avgTradesPerDay}
                </span>
              </div>
            </>
          ) : (
            <span className="text-lg text-primary-300">—</span>
          )}
        </div>

        {/* Most Profitable Day */}
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.mostProfitableDay}</span>
          {summary.mostProfitableDay ? (
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl font-bold text-white">
                {summary.mostProfitableDay.dayName}
              </span>
              <span className={`text-xl font-bold ${pnlColor(summary.mostProfitableDay.pnl)}`}>
                {fmt(summary.mostProfitableDay.pnl)}
              </span>
            </div>
          ) : (
            <span className="text-lg text-primary-300">—</span>
          )}
        </div>

        {/* Least Profitable Day */}
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.leastProfitableDay}</span>
          {summary.leastProfitableDay ? (
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl font-bold text-white">
                {summary.leastProfitableDay.dayName}
              </span>
              <span className={`text-xl font-bold ${pnlColor(summary.leastProfitableDay.pnl)}`}>
                {fmt(summary.leastProfitableDay.pnl)}
              </span>
            </div>
          ) : (
            <span className="text-lg text-primary-300">—</span>
          )}
        </div>
      </div>

      {/* Row 2: Total Trades / Total Lots / Avg Trade Duration */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.totalTrades}</span>
          <span className="text-3xl font-bold text-white">{summary.totalTrades}</span>
        </div>
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.totalLotsTraded}</span>
          <span className="text-3xl font-bold text-primary-300">—</span>
        </div>
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.avgTradeDuration}</span>
          <span className="text-3xl font-bold text-white">
            {summary.avgTradeDurationMs !== null ? formatDuration(summary.avgTradeDurationMs) : "—"}
          </span>
        </div>
      </div>

      {/* Row 3: Avg Win Duration / Avg Loss Duration */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.avgWinDuration}</span>
          <span className="text-3xl font-bold text-white">
            {summary.avgWinDurationMs !== null ? formatDuration(summary.avgWinDurationMs) : "—"}
          </span>
        </div>
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.avgLossDuration}</span>
          <span className="text-3xl font-bold text-white">
            {summary.avgLossDurationMs !== null ? formatDuration(summary.avgLossDurationMs) : "—"}
          </span>
        </div>
      </div>

      {/* Row 4: Avg Winning / Avg Losing / Trade Direction */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.avgWinningTrade}</span>
          <span className={`text-3xl font-bold ${summary.avgWinningTrade !== null ? pnlColor(summary.avgWinningTrade) : "text-primary-300"}`}>
            {summary.avgWinningTrade !== null ? fmt(summary.avgWinningTrade) : "—"}
          </span>
        </div>
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.avgLosingTrade}</span>
          <span className={`text-3xl font-bold ${summary.avgLosingTrade !== null ? pnlColor(summary.avgLosingTrade) : "text-primary-300"}`}>
            {summary.avgLosingTrade !== null ? fmt(summary.avgLosingTrade) : "—"}
          </span>
        </div>
        {/* Trade Direction ring */}
        <div className={`${cardBase} flex-row items-center justify-between`}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-300">{labels.tradeDirection}</span>
            <span className="text-3xl font-bold text-white">
              {fmtNum(buyPct)}%
            </span>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-primary-300">
              <span className="text-emerald-400">{labels.buy}: {summary.buyCount}</span>
              <span className="text-red-400">{labels.sell}: {summary.sellCount}</span>
            </div>
          </div>
          <svg width="80" height="80" viewBox="0 0 80 80">
            {/* Background circle */}
            <circle
              cx="40"
              cy="40"
              r={ringR}
              fill="none"
              stroke="rgba(239,68,68,0.35)"
              strokeWidth="8"
            />
            {/* Buy arc */}
            {buyPct > 0 && (
              <circle
                cx="40"
                cy="40"
                r={ringR}
                fill="none"
                stroke="#34d399"
                strokeWidth="8"
                strokeDasharray={`${buyArc} ${ringCircumference - buyArc}`}
                strokeDashoffset={ringCircumference * 0.25}
                strokeLinecap="round"
              />
            )}
            {/* Center count */}
            <text x="40" y="45" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">
              {totalSided}
            </text>
          </svg>
        </div>
      </div>

      {/* Row 5: Best / Worst Trade */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.bestTrade}</span>
          {summary.bestTrade ? (
            <div className="flex items-start justify-between gap-2">
              <span className={`text-3xl font-bold ${pnlColor(summary.bestTrade.pnl)}`}>
                {fmt(summary.bestTrade.pnl)}
              </span>
              <div className="flex flex-col items-end gap-0.5 text-right text-xs text-primary-300">
                {formatBestWorstSubtitle(summary.bestTrade)
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
              </div>
            </div>
          ) : (
            <span className="text-lg text-primary-300">—</span>
          )}
        </div>
        <div className={cardBase}>
          <span className="text-xs font-medium text-primary-300">{labels.worstTrade}</span>
          {summary.worstTrade ? (
            <div className="flex items-start justify-between gap-2">
              <span className={`text-3xl font-bold ${pnlColor(summary.worstTrade.pnl)}`}>
                {fmt(summary.worstTrade.pnl)}
              </span>
              <div className="flex flex-col items-end gap-0.5 text-right text-xs text-primary-300">
                {formatBestWorstSubtitle(summary.worstTrade)
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
              </div>
            </div>
          ) : (
            <span className="text-lg text-primary-300">—</span>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

function buildPerformanceByMonthDisplay(
  summary: PerformanceByMonthSummary,
  gainMode: PerformanceByMonthGainMode,
  balanceMode: PerformanceByMonthBalanceMode,
  initialBalance: number
): PerformanceByMonthDisplay {
  if (summary.years.length === 0) {
    return { rows: [], totalYtd: null };
  }

  const safeInitialBalance = Math.max(1, initialBalance);
  const rows: PerformanceByMonthDisplayRow[] = [];

  let runningBalance = safeInitialBalance;
  let totalPnl = 0;

  summary.years.forEach((yearBucket) => {
    const rowValues: Array<number | null> = Array.from({ length: 12 }, () => null);
    const yearStartBalance = runningBalance;
    let yearPnl = 0;
    let hasYearData = false;

    yearBucket.monthlyPnl.forEach((monthPnl, monthIndex) => {
      if (!yearBucket.hasTrade[monthIndex]) {
        return;
      }

      hasYearData = true;
      const monthBase = balanceMode === "initialBalance" ? safeInitialBalance : Math.max(1, runningBalance);
      const monthGain = (monthPnl / monthBase) * 100;

      yearPnl += monthPnl;
      totalPnl += monthPnl;

      if (gainMode === "accumSessionsGains") {
        rowValues[monthIndex] = monthGain;
      } else {
        const overallBase =
          balanceMode === "initialBalance" ? safeInitialBalance : Math.max(1, yearStartBalance);
        rowValues[monthIndex] = (yearPnl / overallBase) * 100;
      }

      runningBalance += monthPnl;
    });

    if (!hasYearData) {
      rows.push({ year: yearBucket.year, values: rowValues, ytd: null });
      return;
    }

    const ytdBase = balanceMode === "initialBalance" ? safeInitialBalance : Math.max(1, yearStartBalance);
    rows.push({
      year: yearBucket.year,
      values: rowValues,
      ytd: (yearPnl / ytdBase) * 100,
    });
  });

  const totalYtd = (totalPnl / safeInitialBalance) * 100;
  return {
    rows,
    totalYtd,
  };
}

function formatPerformanceByMonthPercentage(value: number | null, language: string) {
  if (value === null) return "-";

  const rounded = Number(value.toFixed(2));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(getLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded)}%`;
}

function formatPerformanceByDayWinRate(value: number, language: string) {
  return `${new Intl.NumberFormat(getLocale(language), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.max(0, value))}%`;
}

function formatPerformanceByDayAxisValue(value: number, language: string) {
  return `${new Intl.NumberFormat(getLocale(language), {
    maximumFractionDigits: 0,
  }).format(Math.max(0, value))}%`;
}

function formatPerformanceByTimeAxisValue(
  metric: PerformanceByTimeMetricKey,
  value: number,
  language: string
) {
  const locale = getLocale(language);

  if (metric === "totalPnl") {
    const absValue = Math.abs(value);
    if (absValue >= 1000) {
      return `${value < 0 ? "-" : ""}${new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(absValue / 1000)}k`;
    }

    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  if (metric === "winRate") {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(Math.max(0, value))}%`;
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

function formatPerformanceByTimeTooltipValue(
  metric: PerformanceByTimeMetricKey,
  value: number,
  language: string
) {
  const locale = getLocale(language);

  if (metric === "totalPnl") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (metric === "winRate") {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Math.max(0, value))}%`;
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

type RingProgressProps = {
  value: number;
  color: string;
  size: number;
  thickness: number;
};

function RingProgress({ value, color, size, thickness }: RingProgressProps) {
  const percentage = clampPercentage(value);
  return (
    <div
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        padding: `${thickness}px`,
        backgroundImage: `conic-gradient(${color} 0% ${percentage}%, rgba(226,232,240,0.85) ${percentage}% 100%)`,
      }}
      aria-hidden
    >
      <div className="h-full w-full rounded-full bg-[#0f172a]/95" />
    </div>
  );
}

function SideChartTooltipBubble({ tooltip }: { tooltip: SideChartTooltipState }) {
  const left = Math.min(132, Math.max(12, tooltip.x));

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left: `${left}px`, top: `${tooltip.y}px`, transform: "translate(-50%, calc(-100% - 10px))" }}
    >
      <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tooltip.color }} aria-hidden />
          <span className="font-semibold">{tooltip.label}</span>
        </div>
        <div className="mt-1 text-primary-100">{tooltip.value}</div>
      </div>
    </div>
  );
}

function getRingPointerMetrics(event: ReactPointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const center = bounds.width / 2;
  const dx = x - center;
  const dy = y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angleFromTopClockwise = (Math.atan2(dy, dx) * 180) / Math.PI + 450;

  return {
    x,
    y,
    distance,
    angleFromTopClockwise: angleFromTopClockwise % 360,
  };
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
          <linearGradient id="historyLineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
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
          fill="url(#historyLineFill)"
          points={`${paddingX},${height - paddingY} ${points} ${width - paddingX},${height - paddingY}`}
          opacity="0.65"
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
  const chartHeight = 200;
  const max = Math.max(0, ...data);
  const min = Math.min(0, ...data);
  const yRange = max === min ? 1 : max - min;
  const zeroY = ((max - 0) / yRange) * chartHeight;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const monthSegments = useMemo(() => getMonthSegments(labels), [labels]);
  const animationSeed = useMemo(() => `${labels.join("|")}::${data.join("|")}`, [data, labels]);

  return (
    <div className="relative h-full w-full">
      <div className="relative h-52">
        {min < 0 && max > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 border-t border-primary-700/70"
            style={{ top: `${zeroY}px` }}
            aria-hidden
          />
        )}

        <div key={animationSeed} className="absolute inset-0 flex gap-2">
          {data.map((value, idx) => {
            const barHeight = Math.max(0, Math.min(chartHeight, (Math.abs(value) / yRange) * chartHeight));
            const top = value >= 0 ? zeroY - barHeight : zeroY;
            const isHover = hoverIdx === idx;
            return (
              <div
                key={`${value}-${idx}`}
                className="relative flex-1"
                aria-label={`${labels[idx]}: ${value}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <div
                  className="absolute left-0 right-0 rounded-sm"
                  style={{
                    top: `${top}px`,
                    height: `${barHeight}px`,
                  }}
                >
                  <div
                    className="h-full w-full rounded-sm"
                    style={{
                      transformOrigin: value >= 0 ? "bottom" : "top",
                      animation: `${value >= 0 ? "statsBarGrowBottom" : "statsBarGrowTop"} 640ms cubic-bezier(0.2, 0.9, 0.2, 1) ${idx * 45}ms both`,
                      backgroundImage:
                        value >= 0
                          ? `linear-gradient(to top, ${color}08 0%, ${color}50 40%, ${color}CC 75%, ${color}FF 100%)`
                          : `linear-gradient(to bottom, ${color}08 0%, ${color}50 40%, ${color}CC 75%, ${color}FF 100%)`,
                      opacity: isHover ? 1 : 0.82,
                      boxShadow: isHover
                        ? `inset 0 1px 0 rgba(255,255,255,0.3), 0 0 18px ${color}50`
                        : `inset 0 1px 0 rgba(255,255,255,0.12)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-10 left-0 flex w-full justify-center">
          <div className="rounded-xl border border-[#2E5C8A]/50 bg-[#1B314B] px-3 py-2 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <div className="font-semibold text-white">{labels[hoverIdx]}</div>
            <div className="text-primary-100">{data[hoverIdx]}</div>
          </div>
        </div>
      )}

      {monthSegments.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center text-[10px] text-primary-300">
            {monthSegments.map((segment) => (
              <div
                key={segment.label}
                className="px-1"
                style={{ flex: `${segment.count} 1 0%` }}
              >
                <div className="border-t border-primary-700/60" />
                <div className="mt-1 text-center uppercase tracking-[0.2em]">{segment.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes statsBarGrowBottom {
          from {
            transform: scaleY(0);
          }
          to {
            transform: scaleY(1);
          }
        }

        @keyframes statsBarGrowTop {
          from {
            transform: scaleY(0);
          }
          to {
            transform: scaleY(1);
          }
        }
      `}</style>
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
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span className="font-semibold">{label}</span>
        </div>
        <div className="mt-1 text-primary-100">{value}</div>
      </div>
    </div>
  );
}

type MonthSegment = {
  label: string;
  count: number;
};

function getMonthSegments(labels: string[]) {
  if (!labels.length || labels[0] === "--") return [] as MonthSegment[];
  return labels.reduce<MonthSegment[]>((acc, label) => {
    const month = label.split(" ")[0];
    const current = acc[acc.length - 1];
    if (!current || current.label !== month) {
      acc.push({ label: month, count: 1 });
    } else {
      current.count += 1;
    }
    return acc;
  }, []);
}

function formatLabel(date: string) {
  const [, month, day] = date.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${String(day).padStart(2, "0")}`;
}

function getDefaultRange(trades: { date: string }[]) {
  if (!trades.length) {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from, to: now };
  }

  const latest = trades.reduce((acc, trade) => (trade.date > acc ? trade.date : acc), trades[0].date);
  const to = new Date(`${latest}T23:59:59`);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to };
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function buildSidePerformanceSummary(trades: HistoryTrade[]): SidePerformanceSummary {
  let buyTrades = 0;
  let sellTrades = 0;
  let buyWins = 0;
  let buyLosses = 0;
  let sellWins = 0;
  let sellLosses = 0;

  trades.forEach((trade) => {
    if (trade.side === "buy") {
      buyTrades += 1;
      if (trade.outcome === "win") buyWins += 1;
      if (trade.outcome === "loss") buyLosses += 1;
      return;
    }

    if (trade.side === "sell") {
      sellTrades += 1;
      if (trade.outcome === "win") sellWins += 1;
      if (trade.outcome === "loss") sellLosses += 1;
    }
  });

  const tradesBySideTotal = buyTrades + sellTrades;
  const buyResolved = buyWins + buyLosses;
  const sellResolved = sellWins + sellLosses;

  return {
    buyTrades,
    sellTrades,
    buyTradeShare: tradesBySideTotal > 0 ? (buyTrades / tradesBySideTotal) * 100 : 0,
    sellTradeShare: tradesBySideTotal > 0 ? (sellTrades / tradesBySideTotal) * 100 : 0,
    buyWinRate: buyResolved > 0 ? (buyWins / buyResolved) * 100 : 0,
    sellWinRate: sellResolved > 0 ? (sellWins / sellResolved) * 100 : 0,
  };
}

function buildPerformanceByTimeSummary(trades: HistoryTrade[]): PerformanceByTimeSummary {
  const hours = Array.from({ length: 24 }, (_, hour) => `${hour}:00`);
  const totalPnl = Array.from({ length: 24 }, () => 0);
  const totalTrades = Array.from({ length: 24 }, () => 0);
  const wins = Array.from({ length: 24 }, () => 0);
  const losses = Array.from({ length: 24 }, () => 0);

  trades.forEach((trade) => {
    const hour = getTradeHourBucket(trade);
    if (hour === null) return;

    totalPnl[hour] += trade.pnl;
    totalTrades[hour] += 1;

    if (trade.outcome === "win") {
      wins[hour] += 1;
    }

    if (trade.outcome === "loss") {
      losses[hour] += 1;
    }
  });

  const winRate = Array.from({ length: 24 }, (_, hour) => {
    const resolvedTrades = wins[hour] + losses[hour];
    if (resolvedTrades <= 0) return 0;
    return (wins[hour] / resolvedTrades) * 100;
  });

  return {
    hours,
    totalPnl,
    totalTrades,
    winRate,
  };
}

function buildPerformanceByDaySummary(trades: HistoryTrade[], language: string): PerformanceByDaySummary {
  const weekdayLabels = getWeekdayLabels(language);
  const buckets = Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    pnl: 0,
    wins: 0,
    losses: 0,
  }));

  trades.forEach((trade) => {
    const weekday = getTradeWeekdayBucket(trade);
    if (weekday === null) return;

    buckets[weekday].pnl += trade.pnl;

    if (trade.outcome === "win") {
      buckets[weekday].wins += 1;
    }

    if (trade.outcome === "loss") {
      buckets[weekday].losses += 1;
    }
  });

  return {
    rows: buckets.map((bucket) => {
      const resolvedTrades = bucket.wins + bucket.losses;
      return {
        dayIndex: bucket.dayIndex,
        dayLabel: weekdayLabels[bucket.dayIndex],
        pnl: bucket.pnl,
        winRate: resolvedTrades > 0 ? (bucket.wins / resolvedTrades) * 100 : null,
      };
    }),
  };
}

function buildPerformanceByMonthSummary(
  trades: HistoryTrade[],
  language: string
): PerformanceByMonthSummary {
  const byYear = new Map<number, PerformanceByMonthYearBucket>();

  trades.forEach((trade) => {
    const simulatedYearMonth = getTradeSimulatedYearMonth(trade);
    if (!simulatedYearMonth) return;

    const bucket = byYear.get(simulatedYearMonth.year) ?? {
      year: simulatedYearMonth.year,
      monthlyPnl: Array.from({ length: 12 }, () => 0),
      hasTrade: Array.from({ length: 12 }, () => false),
    };

    bucket.monthlyPnl[simulatedYearMonth.month] += trade.pnl;
    bucket.hasTrade[simulatedYearMonth.month] = true;
    byYear.set(simulatedYearMonth.year, bucket);
  });

  const years = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  return {
    monthLabels: getMonthShortLabels(language),
    years,
  };
}

function buildAverageTradeFrequencySummary(
  trades: HistoryTrade[],
  language: string
): AverageTradeFrequencySummary {
  const dayLabels = getWeekdayLabels(language);
  const dayCounts = Array.from({ length: 7 }, () => 0);
  const weekCounts = new Map<string, { year: number; week: number; count: number }>();
  const monthCounts = new Map<string, { year: number; month: number; count: number }>();

  const uniqueDays = new Set<string>();
  const uniqueWeeks = new Set<string>();
  const uniqueMonths = new Set<string>();

  trades.forEach((trade) => {
    const simulatedDate = getSimulatedDateFromTradeDate(trade.date);
    if (!simulatedDate) return;

    const dayIndex = simulatedDate.getUTCDay();
    dayCounts[dayIndex] += 1;

    const isoDate = trade.date;
    uniqueDays.add(isoDate);

    const isoWeekInfo = getIsoWeekInfo(simulatedDate);
    const weekKey = `${isoWeekInfo.year}-${isoWeekInfo.week}`;
    const weekBucket = weekCounts.get(weekKey) ?? {
      year: isoWeekInfo.year,
      week: isoWeekInfo.week,
      count: 0,
    };
    weekBucket.count += 1;
    weekCounts.set(weekKey, weekBucket);
    uniqueWeeks.add(weekKey);

    const yearMonth = getTradeSimulatedYearMonth(trade);
    if (!yearMonth) return;

    const monthKey = `${yearMonth.year}-${yearMonth.month}`;
    const monthBucket = monthCounts.get(monthKey) ?? {
      year: yearMonth.year,
      month: yearMonth.month,
      count: 0,
    };
    monthBucket.count += 1;
    monthCounts.set(monthKey, monthBucket);
    uniqueMonths.add(monthKey);
  });

  const dayBuckets = dayCounts.map((count, dayIndex) => ({
    label: dayLabels[dayIndex],
    value: count,
  }));

  const orderedWeeks = Array.from(weekCounts.values())
    .sort((a, b) => (a.year === b.year ? a.week - b.week : a.year - b.year))
    .slice(-8);

  const weekBuckets = orderedWeeks.map((bucket) => ({
    label: String(bucket.week),
    value: bucket.count,
  }));

  const monthLabels = getMonthShortLabels(language);
  const orderedMonths = Array.from(monthCounts.values())
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
    .slice(-8);

  const monthBuckets = orderedMonths.map((bucket) => ({
    label: monthLabels[bucket.month],
    value: bucket.count,
  }));

  return {
    dayBuckets,
    weekBuckets,
    monthBuckets,
    dayAverage: uniqueDays.size > 0 ? trades.length / uniqueDays.size : 0,
    weekAverage: uniqueWeeks.size > 0 ? trades.length / uniqueWeeks.size : 0,
    monthAverage: uniqueMonths.size > 0 ? trades.length / uniqueMonths.size : 0,
  };
}

function formatAverageTradeFrequencyValue(value: number, language: string) {
  return new Intl.NumberFormat(getLocale(language), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

// ─── Trade Statistics ────────────────────────────────────────────────────────

type TradeStatsSummary = {
  mostActiveDay: {
    dayName: string;
    activeDays: number;
    totalTrades: number;
    avgTradesPerDay: number;
  } | null;
  mostProfitableDay: { dayName: string; pnl: number } | null;
  leastProfitableDay: { dayName: string; pnl: number } | null;
  totalTrades: number;
  avgTradeDurationMs: number | null;
  avgWinDurationMs: number | null;
  avgLossDurationMs: number | null;
  avgWinningTrade: number | null;
  avgLosingTrade: number | null;
  buyCount: number;
  sellCount: number;
  bestTrade: {
    pnl: number;
    symbol: string;
    side?: string;
    openedAt?: string | null;
    closedAt?: string | null;
  } | null;
  worstTrade: {
    pnl: number;
    symbol: string;
    side?: string;
    openedAt?: string | null;
    closedAt?: string | null;
  } | null;
};

function buildTradeStatsSummary(trades: HistoryTrade[], language: string): TradeStatsSummary {
  const dayLabels = getWeekdayLabels(language);
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      mostActiveDay: null,
      mostProfitableDay: null,
      leastProfitableDay: null,
      totalTrades: 0,
      avgTradeDurationMs: null,
      avgWinDurationMs: null,
      avgLossDurationMs: null,
      avgWinningTrade: null,
      avgLosingTrade: null,
      buyCount: 0,
      sellCount: 0,
      bestTrade: null,
      worstTrade: null,
    };
  }

  // Group by weekday name for most/least active/profitable
  const byWeekday = Array.from({ length: 7 }, () => ({
    trades: 0,
    distinctDates: new Set<string>(),
    totalPnl: 0,
  }));

  let totalDurationMs = 0;
  let durationCount = 0;
  let winDurationMs = 0;
  let winDurationCount = 0;
  let lossDurationMs = 0;
  let lossDurationCount = 0;
  let winPnlSum = 0;
  let winCount = 0;
  let lossPnlSum = 0;
  let lossCount = 0;
  let buyCount = 0;
  let sellCount = 0;
  let bestTrade: TradeStatsSummary["bestTrade"] = null;
  let worstTrade: TradeStatsSummary["worstTrade"] = null;

  for (const trade of trades) {
    // Weekday aggregation
    const simDate = getSimulatedDateFromTradeDate(trade.date);
    if (simDate) {
      const dow = simDate.getUTCDay();
      byWeekday[dow].trades += 1;
      byWeekday[dow].distinctDates.add(trade.date);
      if (trade.hasPnl) byWeekday[dow].totalPnl += trade.pnl;
    }

    // Duration
    if (trade.openedAt && trade.closedAt) {
      const open = new Date(trade.openedAt).getTime();
      const close = new Date(trade.closedAt).getTime();
      if (!isNaN(open) && !isNaN(close) && close >= open) {
        const diff = close - open;
        totalDurationMs += diff;
        durationCount += 1;
        if (trade.outcome === "win") {
          winDurationMs += diff;
          winDurationCount += 1;
        } else if (trade.outcome === "loss") {
          lossDurationMs += diff;
          lossDurationCount += 1;
        }
      }
    }

    // Avg win / loss pnl
    if (trade.hasPnl) {
      if (trade.outcome === "win") {
        winPnlSum += trade.pnl;
        winCount += 1;
      } else if (trade.outcome === "loss") {
        lossPnlSum += trade.pnl;
        lossCount += 1;
      }
    }

    // Side direction
    if (trade.side === "buy") buyCount += 1;
    else if (trade.side === "sell") sellCount += 1;

    // Best / worst trade
    if (trade.hasPnl) {
      if (bestTrade === null || trade.pnl > bestTrade.pnl) {
        bestTrade = {
          pnl: trade.pnl,
          symbol: trade.symbol,
          side: trade.side,
          openedAt: trade.openedAt,
          closedAt: trade.closedAt,
        };
      }
      if (worstTrade === null || trade.pnl < worstTrade.pnl) {
        worstTrade = {
          pnl: trade.pnl,
          symbol: trade.symbol,
          side: trade.side,
          openedAt: trade.openedAt,
          closedAt: trade.closedAt,
        };
      }
    }
  }

  // Most active day
  let mostActiveIdx = -1;
  for (let i = 0; i < 7; i++) {
    if (mostActiveIdx === -1 || byWeekday[i].trades > byWeekday[mostActiveIdx].trades) {
      mostActiveIdx = i;
    }
  }
  const mostActiveDayData =
    mostActiveIdx >= 0 && byWeekday[mostActiveIdx].trades > 0
      ? {
          dayName: dayLabels[mostActiveIdx],
          activeDays: byWeekday[mostActiveIdx].distinctDates.size,
          totalTrades: byWeekday[mostActiveIdx].trades,
          avgTradesPerDay:
            byWeekday[mostActiveIdx].distinctDates.size > 0
              ? byWeekday[mostActiveIdx].trades / byWeekday[mostActiveIdx].distinctDates.size
              : 0,
        }
      : null;

  // Most / least profitable day (only among days that had trades)
  let profitableIdx = -1;
  let unprofitableIdx = -1;
  for (let i = 0; i < 7; i++) {
    if (byWeekday[i].trades === 0) continue;
    if (profitableIdx === -1 || byWeekday[i].totalPnl > byWeekday[profitableIdx].totalPnl) {
      profitableIdx = i;
    }
    if (unprofitableIdx === -1 || byWeekday[i].totalPnl < byWeekday[unprofitableIdx].totalPnl) {
      unprofitableIdx = i;
    }
  }

  return {
    mostActiveDay: mostActiveDayData,
    mostProfitableDay:
      profitableIdx >= 0
        ? { dayName: dayLabels[profitableIdx], pnl: byWeekday[profitableIdx].totalPnl }
        : null,
    leastProfitableDay:
      unprofitableIdx >= 0
        ? { dayName: dayLabels[unprofitableIdx], pnl: byWeekday[unprofitableIdx].totalPnl }
        : null,
    totalTrades,
    avgTradeDurationMs: durationCount > 0 ? totalDurationMs / durationCount : null,
    avgWinDurationMs: winDurationCount > 0 ? winDurationMs / winDurationCount : null,
    avgLossDurationMs: lossDurationCount > 0 ? lossDurationMs / lossDurationCount : null,
    avgWinningTrade: winCount > 0 ? winPnlSum / winCount : null,
    avgLosingTrade: lossCount > 0 ? lossPnlSum / lossCount : null,
    buyCount,
    sellCount,
    bestTrade,
    worstTrade,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "0 sec";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} sec`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function getSimulatedDateFromTradeDate(dateValue: string) {
  const [yearString, monthString, dayString] = dateValue.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function getIsoWeekInfo(date: Date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return {
    year: utcDate.getUTCFullYear(),
    week,
  };
}

function getTradeSimulatedYearMonth(trade: HistoryTrade): { year: number; month: number } | null {
  const [yearString, monthString] = trade.date.split("-");
  const year = Number(yearString);
  const month = Number(monthString) - 1;

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return null;
  }

  return { year, month };
}

function getMonthShortLabels(language: string) {
  const locale = getLocale(language);
  const formatter = new Intl.DateTimeFormat(locale, { month: "short" });

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const date = new Date(Date.UTC(2026, monthIndex, 1, 12, 0, 0));
    return formatter.format(date).replace(".", "");
  });
}

function getWeekdayLabels(language: string) {
  const locale = getLocale(language);
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const date = new Date(Date.UTC(2026, 0, 4 + dayIndex, 12, 0, 0));
    return formatter.format(date);
  });
}

function getTradeWeekdayBucket(trade: HistoryTrade): number | null {
  const dateReference = trade.closedAt || trade.openedAt || trade.createdAt || `${trade.date}T12:00:00`;
  const date = new Date(dateReference);
  if (Number.isNaN(date.getTime())) return null;

  return date.getDay();
}

function getTradeHourBucket(trade: HistoryTrade): number | null {
  const dateReference = trade.closedAt || trade.openedAt || trade.createdAt;
  if (!dateReference) return null;

  const date = new Date(dateReference);
  if (Number.isNaN(date.getTime())) return null;

  return date.getHours();
}

function buildSessionPerformanceSummary(trades: HistoryTrade[]): SessionPerformanceSummary {
  const bySession = {
    out: {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      totalWinPnl: 0,
      totalLossPnlAbs: 0,
      winCount: 0,
      lossCount: 0,
    },
    asia: {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      totalWinPnl: 0,
      totalLossPnlAbs: 0,
      winCount: 0,
      lossCount: 0,
    },
    ny: {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      totalWinPnl: 0,
      totalLossPnlAbs: 0,
      winCount: 0,
      lossCount: 0,
    },
    london: {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      totalWinPnl: 0,
      totalLossPnlAbs: 0,
      winCount: 0,
      lossCount: 0,
    },
  };

  trades.forEach((trade) => {
    const sessionKey = toSessionAxisKey(trade.session);
    const bucket = bySession[sessionKey];

    bucket.trades += 1;
    bucket.totalPnl += trade.pnl;

    if (trade.outcome === "win") {
      bucket.wins += 1;
      bucket.winCount += 1;
      bucket.totalWinPnl += Math.max(0, trade.pnl);
    }

    if (trade.outcome === "loss") {
      bucket.losses += 1;
      bucket.lossCount += 1;
      bucket.totalLossPnlAbs += Math.abs(trade.pnl);
    }
  });

  const winRateRaw = createEmptySessionAxisValues();
  const totalTradesRaw = createEmptySessionAxisValues();
  const avgRrRaw = createEmptySessionAxisValues();
  const profitRaw = createEmptySessionAxisValues();

  SESSION_AXIS_ORDER.forEach((sessionKey) => {
    const bucket = bySession[sessionKey];
    const resolvedTrades = bucket.wins + bucket.losses;
    const averageWin = bucket.winCount > 0 ? bucket.totalWinPnl / bucket.winCount : 0;
    const averageLossAbs = bucket.lossCount > 0 ? bucket.totalLossPnlAbs / bucket.lossCount : 0;

    winRateRaw[sessionKey] = resolvedTrades > 0 ? (bucket.wins / resolvedTrades) * 100 : 0;
    totalTradesRaw[sessionKey] = bucket.trades;
    avgRrRaw[sessionKey] = averageLossAbs > 0 ? averageWin / averageLossAbs : 0;
    profitRaw[sessionKey] = bucket.totalPnl;
  });

  const winRateNormalized = SESSION_AXIS_ORDER.reduce((accumulator, sessionKey) => {
    accumulator[sessionKey] = clampPercentage(winRateRaw[sessionKey]);
    return accumulator;
  }, createEmptySessionAxisValues());

  const totalTradesNormalized = normalizeSessionAxisByMax(totalTradesRaw);
  const avgRrNormalized = normalizeSessionAxisByMax(avgRrRaw);
  const profitNormalized = normalizeSessionAxisProfit(profitRaw);

  return {
    winRate: {
      normalized: winRateNormalized,
      raw: winRateRaw,
      kind: "percent",
    },
    totalTrades: {
      normalized: totalTradesNormalized,
      raw: totalTradesRaw,
      kind: "count",
    },
    avgRr: {
      normalized: avgRrNormalized,
      raw: avgRrRaw,
      kind: "ratio",
    },
    profit: {
      normalized: profitNormalized,
      raw: profitRaw,
      kind: "currency",
    },
  };
}

function createEmptySessionAxisValues(): SessionAxisValues {
  return {
    out: 0,
    asia: 0,
    ny: 0,
    london: 0,
  };
}

function toSessionAxisKey(session: HistoryTrade["session"]): SessionAxisKey {
  if (session === "asia" || session === "ny" || session === "london") {
    return session;
  }

  return "out";
}

function normalizeSessionAxisByMax(values: SessionAxisValues): SessionAxisValues {
  const maxValue = Math.max(...SESSION_AXIS_ORDER.map((sessionKey) => values[sessionKey]));
  if (maxValue <= 0) {
    return createEmptySessionAxisValues();
  }

  return SESSION_AXIS_ORDER.reduce((accumulator, sessionKey) => {
    accumulator[sessionKey] = (values[sessionKey] / maxValue) * 100;
    return accumulator;
  }, createEmptySessionAxisValues());
}

function normalizeSessionAxisProfit(values: SessionAxisValues): SessionAxisValues {
  const rawValues = SESSION_AXIS_ORDER.map((sessionKey) => values[sessionKey]);
  const minValue = Math.min(...rawValues);
  const maxValue = Math.max(...rawValues);

  if (minValue === maxValue) {
    return minValue > 0
      ? SESSION_AXIS_ORDER.reduce((accumulator, sessionKey) => {
          accumulator[sessionKey] = 100;
          return accumulator;
        }, createEmptySessionAxisValues())
      : createEmptySessionAxisValues();
  }

  const spread = maxValue - minValue;
  return SESSION_AXIS_ORDER.reduce((accumulator, sessionKey) => {
    accumulator[sessionKey] = ((values[sessionKey] - minValue) / spread) * 100;
    return accumulator;
  }, createEmptySessionAxisValues());
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatPercentage(value: number, language: string): string {
  return `${new Intl.NumberFormat(getLocale(language), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(clampPercentage(value))}%`;
}

type CalendarStats = {
  totalTrades: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  pnl: number;
};

type CalendarDay = {
  key: string;
  value: string | null;
  label: number | null;
  isPlaceholder: boolean;
  stats: CalendarStats;
};

type DayChartPoint = {
  x: number;
  y: number;
  value: number;
  timestamp: number;
};

type DayPerformanceChart = {
  points: DayChartPoint[];
  positiveAreaPath: string;
  negativeAreaPath: string;
  positiveLinePaths: string[];
  negativeLinePaths: string[];
  zeroY: number;
  verticalGuides: number[];
  axisLabels: Array<{ x: number; label: string; anchor: "start" | "middle" | "end" }>;
};

const calendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildCalendarDays(viewDate: Date, tradesByDate: Map<string, HistoryTrade[]>) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const monthDays = lastDay.getDate();
  const totalCells = Math.ceil((startOffset + monthDays) / 7) * 7;
  const days: CalendarDay[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - startOffset + 1;
    const isPlaceholder = dayNumber < 1 || dayNumber > monthDays;

    if (isPlaceholder) {
      days.push({
        key: `empty-${year}-${month}-${index}`,
        value: null,
        label: null,
        isPlaceholder: true,
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
    const trades = tradesByDate.get(value) ?? [];
    const wins = trades.filter((trade) => trade.outcome === "win").length;
    const losses = trades.filter((trade) => trade.outcome === "loss").length;
    const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);

    days.push({
      key: `${value}-${index}`,
      value,
      label: dayNumber,
      isPlaceholder: false,
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

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function addDays(date: Date, delta: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function formatCalendarMonthYear(date: Date, language: string) {
  const locale = getLocale(language);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function formatCalendarIsoDate(value: string, language: string) {
  const locale = getLocale(language);
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date);
}

function formatCalendarDateTime(value: string | null | undefined, language: string) {
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

function getTradeTimestamp(trade: HistoryTrade, selectedDate: string | null) {
  const source = trade.openedAt || trade.closedAt || trade.createdAt || `${selectedDate || trade.date}T12:00:00`;
  const timestamp = new Date(source).getTime();
  if (!Number.isNaN(timestamp)) return timestamp;
  return new Date(`${trade.date}T12:00:00`).getTime();
}

function getTradeDurationMs(trade: HistoryTrade) {
  if (!trade.openedAt || !trade.closedAt) return null;
  const openTimestamp = new Date(trade.openedAt).getTime();
  const closeTimestamp = new Date(trade.closedAt).getTime();
  if (Number.isNaN(openTimestamp) || Number.isNaN(closeTimestamp)) return null;
  if (closeTimestamp < openTimestamp) return null;
  return closeTimestamp - openTimestamp;
}

function buildDayPerformanceChart(
  trades: HistoryTrade[],
  selectedDate: string | null,
  width = 760,
  height = 260
): DayPerformanceChart {
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
    (a, b) => getTradeTimestamp(a, selectedDate) - getTradeTimestamp(b, selectedDate)
  );

  const timeline: Array<{ timestamp: number; value: number }> = [{ timestamp: dayStart, value: 0 }];
  let cumulative = 0;

  orderedTrades.forEach((trade) => {
    cumulative += trade.pnl;
    timeline.push({
      timestamp: Math.min(Math.max(getTradeTimestamp(trade, selectedDate), dayStart), dayEnd),
      value: cumulative,
    });
  });

  timeline.push({ timestamp: dayEnd, value: cumulative });

  const values = timeline.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = Math.max(1, maxValue - minValue);

  const mapX = (timestamp: number) => paddingLeft + ((timestamp - dayStart) / Math.max(1, dayEnd - dayStart)) * chartWidth;
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

  const positiveAreaPath = areaPathFromPoints(positivePoints, zeroY);
  const negativeAreaPath = areaPathFromPoints(negativePoints, zeroY);
  const signedLinePaths = buildSignedLinePaths(points, zeroY);

  const guideCount = 3;
  const verticalGuides = Array.from({ length: guideCount }, (_, index) => {
    const ratio = (index + 1) / (guideCount + 1);
    return paddingLeft + chartWidth * ratio;
  });

  const midTimestamp = dayStart + (dayEnd - dayStart) * 0.5;
  const axisLabels = [
    { x: paddingLeft, label: formatTime(dayStart), anchor: "start" as const },
    { x: mapX(midTimestamp), label: formatTime(midTimestamp), anchor: "middle" as const },
    { x: paddingLeft + chartWidth, label: formatTime(dayEnd), anchor: "end" as const },
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

function buildSignedLinePaths(points: DayChartPoint[], zeroY: number) {
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
    positive: positiveSegments.map((segment) => linePathFromPoints(segment)),
    negative: negativeSegments.map((segment) => linePathFromPoints(segment)),
  };
}

function linePathFromPoints(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function areaPathFromPoints(points: Array<{ x: number; y: number }>, baseY: number) {
  if (points.length === 0) return "";

  const line = linePathFromPoints(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getCalendarInitialDate(trades: HistoryTrade[], fallback: Date) {
  if (!trades.length) return new Date(fallback);
  const latest = trades.reduce((acc, trade) => (trade.date > acc ? trade.date : acc), trades[0].date);
  return new Date(`${latest}T12:00:00`);
}

function getOfficialAccountIdFromUser(user: unknown) {
  if (!user || typeof user !== "object") return "";

  const record = user as Record<string, unknown>;
  const account = record.account;
  const accountRecord = account && typeof account === "object" ? (account as Record<string, unknown>) : null;

  const candidates = [
    accountRecord?.id,
    accountRecord?.accountId,
    accountRecord?.uuid,
    record.accountUuid,
    record.account_id,
    record.accountId,
    getFirstArrayRecordField(record, "accounts", "id"),
    getFirstArrayRecordField(record, "accounts", "accountId"),
    getFirstArrayRecordField(record, "accounts", "uuid"),
    getFirstArrayRecordField(record, "memberships", "accountId"),
    getFirstArrayRecordField(record, "memberships", "account_id"),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim();
    if (isCanonicalUuid(value)) {
      return value;
    }
  }

  return "";
}

function normalizeAuthMeUser(payload: unknown): AuthUser | null {
  const user = extractAuthUserFromMeResponse(payload);
  if (!user) {
    return null;
  }

  const accountId = getOfficialAccountIdFromUser(user);
  if (!accountId || user.accountId === accountId) {
    return user;
  }

  return {
    ...user,
    accountId,
  };
}

function extractAuthUserFromMeResponse(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== "object") return null;

  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [payload, root.user, root.data];

  if (root.data && typeof root.data === "object") {
    candidates.push((root.data as Record<string, unknown>).user);
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    const user = candidate as Record<string, unknown>;
    const hasCoreShape =
      typeof user.id === "string" &&
      typeof user.email === "string" &&
      typeof user.role === "string" &&
      typeof user.status === "string";

    if (hasCoreShape) {
      return user as AuthUser;
    }
  }

  return null;
}

function isCanonicalUuid(value: string) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function isAccountUuidValidationError(error: unknown) {
  return isApiError(error) && error.statusCode === 400 && /accountId must be a UUID/i.test(error.message);
}

function getFirstArrayRecordField(
  source: Record<string, unknown>,
  arrayKey: string,
  fieldKey: string
) {
  const value = source[arrayKey];
  if (!Array.isArray(value) || value.length === 0) return "";

  const first = value[0];
  if (!first || typeof first !== "object") return "";

  const fieldValue = (first as Record<string, unknown>)[fieldKey];
  return typeof fieldValue === "string" ? fieldValue.trim() : "";
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocale(language: string) {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es-ES";
  return "en-US";
}

function isStatsWidgetId(value: unknown): value is StatsWidgetId {
  return DEFAULT_STATS_WIDGET_ORDER.includes(value as StatsWidgetId);
}

function normalizeStatsWidgetOrder(input: unknown) {
  if (!Array.isArray(input)) return DEFAULT_STATS_WIDGET_ORDER;

  const uniqueKnownWidgets = input
    .filter((item): item is StatsWidgetId => isStatsWidgetId(item))
    .filter((item, index, self) => self.indexOf(item) === index);

  if (uniqueKnownWidgets.length !== DEFAULT_STATS_WIDGET_ORDER.length) {
    return DEFAULT_STATS_WIDGET_ORDER;
  }

  return uniqueKnownWidgets;
}

function reorderStatsWidgets(
  currentOrder: StatsWidgetId[],
  sourceWidgetId: StatsWidgetId,
  targetWidgetId: StatsWidgetId
) {
  const nextOrder = [...currentOrder];
  const sourceIndex = nextOrder.indexOf(sourceWidgetId);
  const targetIndex = nextOrder.indexOf(targetWidgetId);

  if (sourceIndex < 0 || targetIndex < 0) return currentOrder;

  nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, sourceWidgetId);
  return nextOrder;
}

function isSameWidgetOrder(first: StatsWidgetId[], second: StatsWidgetId[]) {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
}
