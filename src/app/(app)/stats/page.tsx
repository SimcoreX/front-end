"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { getMarketSymbols, getReferenceSessions } from "@/lib/api/reference";
import { getHistoryTrades } from "@/lib/api/history";
import { DatePicker } from "@/components/forms/DatePicker";
import { SelectField } from "@/components/forms/SelectField";
import { Skeleton } from "@/components/ui/Skeleton";
import { PnlDetailsPanel } from "@/components/content/PnlDetailsPanel";
import { WinnersLosersCards } from "@/components/content/WinnersLosersCards";
import { cn } from "@/lib/classNames";
import { CaretDown as CaretDownIcon, CaretUp as CaretUpIcon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { HistoryOutcomeCardsSummaryViewModel, HistoryTradeItemViewModel } from "@/lib/types/history";
import type { ReferenceSessionItem } from "@/lib/types/reference";

type HistoryTrade = {
  id: string;
  date: string;
  pnl: number;
  hasPnl: boolean;
  outcome: "win" | "loss" | "open" | "breakeven";
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
  | "chart-pnl"
  | "chart-trades"
  | "chart-win-rate"
  | "chart-avg-pnl";

const STATS_LAYOUT_STORAGE_KEY = "simcorex.stats.layout.v1";

const DEFAULT_STATS_WIDGET_ORDER: StatsWidgetId[] = [
  "pnl-panel",
  "outcome-cards",
  "chart-pnl",
  "chart-trades",
  "chart-win-rate",
  "chart-avg-pnl",
];

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
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
  const widgetElementRefs = useRef<Partial<Record<StatsWidgetId, HTMLElement | null>>>({});
  const previousWidgetRectsRef = useRef<Partial<Record<StatsWidgetId, DOMRect>>>({});
  const dragStartOrderRef = useRef<StatsWidgetId[] | null>(null);

  const chartColors = {
    pnl: "#1D9BF0",
    trades: "#A855F7",
    winRate: "#22C55E",
    avgPnl: "#FBBF24",
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

  const selectedDaySummary = useMemo(() => {
    const wins = selectedDayTrades.filter((trade) => trade.outcome === "win").length;
    const losses = selectedDayTrades.filter((trade) => trade.outcome === "loss").length;
    const pnl = selectedDayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    return { wins, losses, pnl };
  }, [selectedDayTrades]);

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
    if (widgetId === "pnl-panel" || widgetId === "outcome-cards") {
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
          className="rounded-xl border border-[#2E5C8A]/60 bg-[#2E5C8A]/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#2E5C8A]/80 hover:bg-[#2E5C8A]/30"
        >
          {t("history.calendar.open")}
        </button>

        <button
          type="button"
          onClick={() => setIsFiltersOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#2E5C8A]/70 bg-[#2E5C8A]/20 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(46,92,138,0.28)] transition hover:border-[#2E5C8A]/90 hover:bg-[#2E5C8A]/30"
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
                      ? "border-[#2E5C8A]/60 bg-[#2E5C8A]/20 text-white shadow-[0_8px_18px_rgba(46,92,138,0.25)]"
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
              : "border-[#2E5C8A]/70 bg-[#2E5C8A]/20 text-white hover:border-[#2E5C8A]/90 hover:bg-[#2E5C8A]/30"
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
                  className="pointer-events-auto cursor-grab rounded-md border border-[#2E5C8A]/60 bg-[#13273d]/95 px-2 py-1 text-xs font-bold text-white active:cursor-grabbing"
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
          <div className="mx-auto flex h-full max-w-450 flex-col overflow-hidden rounded-2xl border border-[#2E5C8A]/50 bg-[#1B314B] p-3 sm:p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary-200">{t("history.title")}</p>
                <p className="text-lg font-semibold text-white">{t("history.calendar.title")}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCalendarDate(null);
                  setIsCalendarOpen(false);
                }}
                className="rounded-xl border border-primary-700/70 px-2.5 py-1.5 text-xs font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white sm:px-3 sm:py-2 sm:text-sm"
              >
                {t("history.calendar.close")}
              </button>
            </div>

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

            <div className="grid grid-cols-7 gap-1 rounded-xl border border-[#2E5C8A]/25 bg-[#102238]/55 px-1.5 py-1 text-center text-[9px] uppercase tracking-[0.12em] text-primary-300 sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-[10px] sm:tracking-[0.2em]">
              {calendarWeekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="mt-2 grid flex-1 grid-cols-7 gap-1 overflow-auto pr-1 sm:gap-2">
              {calendarDays.map((day) => {
                if (day.isPlaceholder || !day.value || !day.label) {
                  return (
                    <div
                      key={day.key}
                      className="min-h-20 rounded-2xl border border-[#2E5C8A]/15 bg-[#102238]/35 sm:min-h-28"
                      aria-hidden
                    />
                  );
                }

                const isSelected = selectedCalendarDate === day.value;
                const hasTrades = day.stats.totalTrades > 0;
                const hasResolvedTrades = day.stats.resolvedTrades > 0;
                const isWinDay = day.stats.pnl >= 0;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => setSelectedCalendarDate(day.value)}
                    className={cn(
                      "group relative flex min-h-20 flex-col justify-between overflow-hidden rounded-2xl border p-1 text-left transition sm:min-h-28 sm:p-2",
                      hasTrades
                        ? "bg-linear-to-b from-[#204164]/90 to-[#17324f]/95"
                        : "bg-[#142a40]/65",
                      isSelected
                        ? "border-[#8CC6FF]/85 shadow-[0_10px_24px_rgba(76,135,186,0.36)]"
                        : "border-[#2E5C8A]/30 hover:border-[#4C87BA]/70",
                      !hasTrades && "opacity-85"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold sm:h-6 sm:w-6 sm:text-xs",
                          isSelected
                            ? "bg-white text-[#14304b]"
                            : "bg-[#0f2236]/75 text-primary-100 group-hover:bg-[#17324f]"
                        )}
                      >
                        {day.label}
                      </span>

                      {day.stats.totalTrades > 0 && (
                        <span className="rounded-full border border-[#63A1D3]/45 bg-[#12314d]/85 px-1.5 py-0.5 text-[9px] font-semibold text-[#C7E4FF] sm:text-[10px]">
                          {day.stats.totalTrades}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center gap-1 sm:hidden">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          hasTrades ? "bg-[#63A1D3]" : "bg-primary-700"
                        )}
                        aria-hidden
                      />
                      {day.stats.wins > 0 && <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden />}
                      {day.stats.losses > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden />}
                    </div>

                    <div className="mt-auto hidden flex-wrap items-center gap-1 text-[10px] sm:flex">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#14324f] px-1.5 py-0.5 text-[#C7E4FF]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#63A1D3]" aria-hidden />
                        {day.stats.totalTrades}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-1.5 py-0.5 text-green-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden />
                        {day.stats.wins}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden />
                        {day.stats.losses}
                      </span>
                      {hasResolvedTrades && (
                        <span className={cn("inline-flex rounded-full px-1.5 py-0.5 font-semibold", isWinDay ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300")}>
                          {isWinDay ? t("history.calendar.winDay") : t("history.calendar.lossDay")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedCalendarDate && (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/45 p-4"
              onClick={() => setSelectedCalendarDate(null)}
            >
              <div
                className="w-full max-w-3xl rounded-2xl border border-[#2E5C8A]/50 bg-[#1B314B] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-primary-200">{t("history.calendar.details")}</p>
                    <p className="text-lg font-semibold text-white">
                      {formatCalendarIsoDate(selectedCalendarDate, i18n.language)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCalendarDate(null)}
                    className="rounded-xl border border-primary-700/70 px-3 py-2 text-sm font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
                  >
                    {t("history.calendar.close")}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm text-primary-100">
                    {t("history.calendar.trades", { count: selectedDayTrades.length })}
                  </div>
                  <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm text-green-300">
                    {t("history.calendar.wins", { count: selectedDaySummary.wins })}
                  </div>
                  <div className="rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm text-red-300">
                    {t("history.calendar.losses", { count: selectedDaySummary.losses })}
                  </div>
                  <div className={cn("rounded-xl border border-[#2E5C8A]/35 bg-[#13273d] px-3 py-2 text-sm", selectedDaySummary.pnl >= 0 ? "text-green-300" : "text-red-300")}>
                    {t("history.summary.totalPnl")}: {formatMoney(selectedDaySummary.pnl)}
                  </div>
                </div>

                <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">
                  {selectedDayTrades.length === 0 && (
                    <p className="text-sm text-primary-300">{t("history.calendar.noTrades")}</p>
                  )}
                  {selectedDayTrades.map((trade) => (
                    <div key={trade.id} className="rounded-xl border border-primary-800/70 bg-primary-950/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{trade.id} · {trade.symbol}</p>
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            trade.outcome === "win"
                              ? "text-green-400"
                              : trade.outcome === "loss"
                                ? "text-red-400"
                                : "text-primary-300"
                          )}
                        >
                          {trade.outcome === "win"
                            ? t("history.calendar.winDay")
                            : trade.outcome === "loss"
                              ? t("history.calendar.lossDay")
                              : trade.outcome.toUpperCase()}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-primary-300">
                        {t("history.fields.session")}: {(trade.sessionLabel || trade.session || "--").toUpperCase()}
                      </p>
                      <p className={cn("text-xs font-semibold", trade.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                        {t("history.summary.totalPnl")}: {formatMoney(trade.pnl)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
    symbol,
    session: normalizeSession(sessionLabel),
    sessionLabel,
    openedAt: trade.openedAt ?? null,
    closedAt: trade.closedAt ?? null,
    createdAt: trade.createdAt ?? null,
  };
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

function formatCalendarMonthYear(date: Date, language: string) {
  const locale = getLocale(language);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function formatCalendarIsoDate(value: string, language: string) {
  const locale = getLocale(language);
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date);
}

function getCalendarInitialDate(trades: HistoryTrade[], fallback: Date) {
  if (!trades.length) return new Date(fallback);
  const latest = trades.reduce((acc, trade) => (trade.date > acc ? trade.date : acc), trades[0].date);
  return new Date(`${latest}T12:00:00`);
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
