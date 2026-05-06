"use client";

import { SessionChartCustomizationCard } from "@/components/content/SessionChartCustomizationCard";
import { PositionBracketsCard } from "@/components/content/PositionBracketsCard";
import { SessionReplayStatsPanel } from "@/components/content/SessionReplayStatsPanel";
import {
  SessionTradeExecutionPanel,
  type SessionContractOption,
} from "@/components/content/SessionTradeExecutionPanel";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { completeSession, getSessionById, listSessions } from "@/lib/api/trades";
import { cn } from "@/lib/classNames";
import { isApiError } from "@/lib/types/api";
import type { SessionDetailResponse, SessionStatus } from "@/lib/types/trades";
import {
  ArrowLeft as ArrowLeftIcon,
  GearSix as GearSixIcon,
  TrendUp as TrendUpIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type ReplaySidebarTool = "chart" | "settings" | "stats";
type SessionUnavailableReason = "closed" | "notFound" | "loadFailed";

export function SessionReplayPage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionDetailResponse | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<SessionUnavailableReason | null>(null);
  const [activeReplaySidebarTool, setActiveReplaySidebarTool] = useState<ReplaySidebarTool>("chart");
  const [selectedContract, setSelectedContract] = useState("");
  const [activeSessionOptions, setActiveSessionOptions] = useState<SessionContractOption[]>([]);
  const [isSessionChangeModalOpen, setIsSessionChangeModalOpen] = useState(false);
  const [pendingSessionChangeId, setPendingSessionChangeId] = useState<string | null>(null);
  const [isExitReplayModalOpen, setIsExitReplayModalOpen] = useState(false);
  const [exitErrorMessage, setExitErrorMessage] = useState<string | null>(null);
  const [exitActionInProgress, setExitActionInProgress] = useState<"pause" | "end" | null>(null);

  const applySessionState = useCallback((response: SessionDetailResponse) => {
    const status = normalizeSessionStatus(response.status);
    setSession(response);

    if (isEditableSessionStatus(status)) {
      setUnavailableReason(null);
      return;
    }

    setUnavailableReason("closed");
  }, []);

  const goBackToSessions = useCallback(() => {
    // Use deterministic navigation to avoid reopening a previous session chart from history.
    router.replace("/dashboard?tab=sessions");
  }, [router]);

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setUnavailableReason("loadFailed");
      setIsLoadingSession(false);
      return;
    }

    setIsLoadingSession(true);
    setExitErrorMessage(null);

    try {
      const response = await getSessionById(sessionId);
      applySessionState(response);
    } catch (error) {
      setSession(null);
      if (isApiError(error) && error.code === "SESSION_NOT_FOUND") {
        setUnavailableReason("notFound");
      } else {
        setUnavailableReason("loadFailed");
      }
    } finally {
      setIsLoadingSession(false);
    }
  }, [applySessionState, sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const sessionContract = normalizeContractSymbol(session?.marketSymbol);
    if (!sessionContract) return;

    setSelectedContract((previous) => previous || sessionContract);
  }, [session?.marketSymbol]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.origin !== "string" || !event.origin.includes("tradingview.com")) {
        return;
      }

      const symbolFromEvent = extractSymbolFromTradingViewMessage(event.data);
      if (!symbolFromEvent) return;

      const normalizedContract = normalizeContractSymbol(symbolFromEvent);
      if (!normalizedContract) return;

      setSelectedContract((previous) =>
        previous === normalizedContract ? previous : normalizedContract
      );
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || unavailableReason) return;

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const response = await getSessionById(sessionId);
          applySessionState(response);
        } catch {
          // Keep the current state on transient polling failures.
        }
      })();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [applySessionState, sessionId, unavailableReason]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await listSessions({ page: 1, limit: 100 });
        if (cancelled) return;

        const editableOptions = response.data
          .filter((item) => isEditableSessionStatus(item.status))
          .map((item) => ({
            value: item.id,
            label: buildSessionSwitchLabel(item.name, item.marketSymbol, item.timeframe),
          }));

        setActiveSessionOptions(editableOptions);
      } catch {
        if (cancelled) return;
        setActiveSessionOptions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const replaySidebarItems = [
    {
      key: "chart" as const,
      label: t("trades.replay.sidebar.chart"),
      svgSrc: "/candlestick-chart-svgrepo-com.svg",
    },
    { key: "settings" as const, label: t("trades.replay.sidebar.settings"), Icon: GearSixIcon },
    { key: "stats" as const, label: t("trades.replay.sidebar.stats"), Icon: TrendUpIcon },
  ];

  const replayStartDate = useMemo(
    () => getReplayDate(session?.startDate || session?.startedAt) || getDefaultStartDate(),
    [session?.startDate, session?.startedAt]
  );
  const replayEndDate = useMemo(
    () => getReplayDate(session?.endDate || session?.endedAt) || getDefaultEndDate(),
    [session?.endDate, session?.endedAt]
  );
  const chartSymbol = useMemo(
    () => toTradingViewSymbol(selectedContract || session?.marketSymbol),
    [selectedContract, session?.marketSymbol]
  );

  const contractOptions = useMemo<SessionContractOption[]>(() => {
    const baseContracts = ["EURUSD", "BTCUSD", "NASDAQ", "XAUUSD", "GBPUSD", "USDJPY"];
    const fromSession = normalizeContractSymbol(session?.marketSymbol);

    const uniqueContracts = new Set<string>(baseContracts);
    if (fromSession) uniqueContracts.add(fromSession);
    if (selectedContract) uniqueContracts.add(selectedContract);

    return Array.from(uniqueContracts).map((contract) => ({
      value: contract,
      label: contract,
    }));
  }, [selectedContract, session?.marketSymbol]);
  const replayFrom = useMemo(() => toUnixTimestamp(replayStartDate, false), [replayStartDate]);
  const replayTo = useMemo(() => toUnixTimestamp(replayEndDate, true), [replayEndDate]);
  const sessionTitle = (session?.name || "").trim();
  const currentSessionOption = useMemo<SessionContractOption>(() => ({
    value: sessionId,
    label: buildSessionSwitchLabel(session?.name, session?.marketSymbol, session?.timeframe),
  }), [session?.marketSymbol, session?.name, session?.timeframe, sessionId]);

  const mergedActiveSessionOptions = useMemo(() => {
    const unique = new Map<string, SessionContractOption>();
    unique.set(currentSessionOption.value, currentSessionOption);

    for (const option of activeSessionOptions) {
      unique.set(option.value, option);
    }

    return Array.from(unique.values());
  }, [activeSessionOptions, currentSessionOption]);

  const selectedSessionOptionLabel = useMemo(() => {
    if (!pendingSessionChangeId) return "";

    const found = mergedActiveSessionOptions.find((option) => option.value === pendingSessionChangeId);
    return found?.label || pendingSessionChangeId;
  }, [mergedActiveSessionOptions, pendingSessionChangeId]);
  const balanceValue = useMemo(() => {
    const sessionBalanceEnd = toFiniteNumber(session?.accountBalanceEnd);
    if (sessionBalanceEnd !== null) return sessionBalanceEnd;

    const balanceStart = toFiniteNumber(session?.accountBalanceStart);
    if (balanceStart === null) return null;

    const netPnl = toFiniteNumber(session?.netPnl) ?? 0;
    return balanceStart + netPnl;
  }, [session?.accountBalanceEnd, session?.accountBalanceStart, session?.netPnl]);
  const balanceDisplayValue = useMemo(() => {
    if (balanceValue !== null) {
      return formatTickerCurrency(balanceValue);
    }

    return "";
  }, [balanceValue]);

  const realizedPnlValue = useMemo(
    () => toFiniteNumber(session?.netPnl),
    [session?.netPnl]
  );

  const unrealizedPnlValue = useMemo(() => {
    if (!session?.trades?.length) return null;

    let hasOpenTradePnl = false;
    let total = 0;

    for (const trade of session.trades) {
      const normalizedStatus = (trade.status || "").toLowerCase();
      const normalizedPerformance = (trade.performance || "").toLowerCase();
      const isOpenTrade = normalizedStatus === "open" || normalizedPerformance === "open";

      if (!isOpenTrade) continue;

      const tradePnl = toFiniteNumber(trade.netPnl);
      if (tradePnl === null) continue;

      hasOpenTradePnl = true;
      total += tradePnl;
    }

    return hasOpenTradePnl ? total : null;
  }, [session?.trades]);

  const unavailableTitle =
    unavailableReason === "closed"
      ? t("trades.replay.closedTitle")
      : unavailableReason === "notFound"
        ? t("trades.replay.notFoundTitle")
        : t("trades.replay.loadFailedTitle");

  const unavailableDescription =
    unavailableReason === "closed"
      ? t("trades.replay.closedDescription")
      : unavailableReason === "notFound"
        ? t("trades.replay.notFoundDescription")
        : t("trades.replay.loadFailedDescription");

  const handleRequestExitReplay = () => {
    if (isLoadingSession) return;
    if (exitActionInProgress) return;
    if (unavailableReason) {
      goBackToSessions();
      return;
    }

    setExitActionInProgress(null);
    setExitErrorMessage(null);
    setIsExitReplayModalOpen(true);
  };

  const handleCancelExitReplay = () => {
    if (exitActionInProgress) return;
    setExitActionInProgress(null);
    setExitErrorMessage(null);
    setIsExitReplayModalOpen(false);
  };

  const handlePauseExitReplay = () => {
    if (exitActionInProgress) return;
    setExitActionInProgress("pause");
    setExitErrorMessage(null);
    goBackToSessions();
  };

  const handleConfirmExitReplay = async () => {
    if (!session) return;
    if (exitActionInProgress) return;

    setExitActionInProgress("end");
    setExitErrorMessage(null);

    try {
      const accountBalance = Number(
        session.accountBalanceEnd === null || session.accountBalanceEnd === undefined
          ? session.accountBalanceStart
          : session.accountBalanceEnd
      );

      await completeSession(session.id, {
        accountBalanceEnd: roundToTwoDecimals(Number.isFinite(accountBalance) ? accountBalance : 0),
        endedAt: new Date().toISOString(),
      });

      goBackToSessions();
    } catch (error) {
      if (isApiError(error)) {
        if (error.code === "SESSION_CLOSED") {
          setExitActionInProgress(null);
          setUnavailableReason("closed");
          setIsExitReplayModalOpen(false);
          setExitErrorMessage(null);
          return;
        }

        if (error.code === "INVALID_SESSION_DATES") {
          setExitActionInProgress(null);
          setExitErrorMessage(t("trades.apiErrors.invalidSessionDates"));
          return;
        }
      }

      setExitActionInProgress(null);
      setExitErrorMessage(t("trades.apiErrors.requestFailed"));
    }
  };

  const handleRequestSessionChange = (nextSessionId: string) => {
    if (!nextSessionId || nextSessionId === sessionId) return;

    setPendingSessionChangeId(nextSessionId);
    setIsSessionChangeModalOpen(true);
  };

  const handleStayOnCurrentSession = () => {
    setIsSessionChangeModalOpen(false);
    setPendingSessionChangeId(null);
  };

  const handleConfirmSessionChange = () => {
    if (!pendingSessionChangeId) return;

    setIsSessionChangeModalOpen(false);
    const targetSessionId = pendingSessionChangeId;
    setPendingSessionChangeId(null);
    router.push(`/session/${targetSessionId}`);
  };

  return (
    <div className="fixed inset-0 z-70 flex overflow-hidden bg-primary-950">
      <aside className="relative z-30 flex w-16 shrink-0 flex-col items-center border-r border-black bg-black px-2 py-3 sm:w-20 sm:px-3 sm:py-4">
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
            className="h-7 w-10 object-contain sm:h-8 sm:w-12"
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
                  "group relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition sm:h-11 sm:w-11",
                  isActive ? "text-white" : "text-white/45"
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
                      isActive ? "brightness-0 invert opacity-100" : "brightness-0 invert opacity-45"
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
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-120 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-primary-700/70 bg-primary-950/95 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition group-hover:opacity-100 group-focus-visible:opacity-100 md:block">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleRequestExitReplay}
          className="mt-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary-700/70 bg-black text-primary-100 transition hover:border-primary-500/70 hover:text-white sm:h-11 sm:w-11"
          aria-label={t("trades.replay.exit")}
          title={t("trades.replay.exit")}
        >
          <ArrowLeftIcon size={22} weight="bold" />
        </button>
      </aside>

      <div className="relative min-w-0 flex-1 bg-[#131722]">
        <div className={cn("h-full w-full", activeReplaySidebarTool === "chart" ? "block" : "hidden")}>
          <div className="flex h-full flex-col">
            <SessionRealtimeHeader
              title={sessionTitle}
              balanceValue={balanceDisplayValue}
              realizedPnlValue={realizedPnlValue}
              unrealizedPnlValue={unrealizedPnlValue}
            />

            <div className="min-h-0 flex flex-1 flex-col xl:flex-row">
              <div className="min-h-[48vh] flex-1 xl:min-h-0">
                {isLoadingSession ? (
                  <div className="flex h-full items-center justify-center text-primary-100">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : (
                  <iframe
                    title="TradingView Replay"
                    className="h-full w-full"
                    src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(chartSymbol)}&interval=5&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hide_side_toolbar=0&allow_symbol_change=1&save_image=1&from=${replayFrom}&to=${replayTo}`}
                  />
                )}
              </div>

              <SessionTradeExecutionPanel
                session={session}
                contractOptions={contractOptions}
                selectedContract={selectedContract || normalizeContractSymbol(session?.marketSymbol) || "EURUSD"}
                onContractChange={setSelectedContract}
                activeSessionOptions={mergedActiveSessionOptions}
                selectedSessionId={sessionId}
                onRequestSessionChange={handleRequestSessionChange}
              />
            </div>
          </div>
        </div>

        <div
          className={cn(
            "h-full min-w-0 overflow-x-hidden overflow-y-auto bg-[#131722] p-3 sm:p-6",
            activeReplaySidebarTool === "settings" ? "block" : "hidden"
          )}
        >
          <div className="space-y-6">
            <PositionBracketsCard />
            <SessionChartCustomizationCard />
          </div>
        </div>

        <div
          className={cn(
            "h-full min-w-0 overflow-x-hidden overflow-y-auto bg-[#131722] p-3 sm:p-6",
            activeReplaySidebarTool === "stats" ? "block" : "hidden"
          )}
        >
          <SessionReplayStatsPanel session={session} isLoading={isLoadingSession} />
        </div>
      </div>

      {isExitReplayModalOpen && (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <p className="text-base font-semibold text-white">{t("trades.replay.exit")}</p>
            <p className="mt-2 text-sm text-primary-200">{t("trades.replay.confirmExit")}</p>

            {exitErrorMessage && <p className="mt-3 text-sm text-red-300">{exitErrorMessage}</p>}

            <div className="mt-5 flex justify-center gap-2">
              <Button
                type="button"
                variant="light"
                onClick={handleCancelExitReplay}
                disabled={Boolean(exitActionInProgress)}
              >
                {t("trades.replay.stay")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handlePauseExitReplay}
                isLoading={exitActionInProgress === "pause"}
                disabled={exitActionInProgress === "end"}
              >
                {t("trades.replay.pause")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmExitReplay}
                isLoading={exitActionInProgress === "end"}
                disabled={exitActionInProgress === "pause"}
              >
                {t("trades.replay.end")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {unavailableReason && (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <p className="text-base font-semibold text-white">{unavailableTitle}</p>
            <p className="mt-2 text-sm text-primary-200">{unavailableDescription}</p>

            <div className="mt-5 flex justify-end">
              <Button type="button" variant="light" onClick={goBackToSessions}>
                {t("trades.replay.back")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isSessionChangeModalOpen && (
        <div className="fixed inset-0 z-85 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <p className="text-base font-semibold text-white">{t("trades.replay.switchSession.title")}</p>
            <p className="mt-2 text-sm text-primary-200">
              {t("trades.replay.switchSession.description", {
                session: selectedSessionOptionLabel,
              })}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleStayOnCurrentSession}>
                {t("trades.replay.switchSession.stay")}
              </Button>
              <Button type="button" variant="light" onClick={handleConfirmSessionChange}>
                {t("trades.replay.switchSession.change")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRealtimeHeader({
  title,
  balanceValue,
  realizedPnlValue,
  unrealizedPnlValue,
}: {
  title: string;
  balanceValue: string;
  realizedPnlValue: number | null;
  unrealizedPnlValue: number | null;
}) {
  return (
    <div className="border-b border-primary-800/80 bg-[#0D1622]/92 px-3 py-1.5 shadow-[0_6px_14px_rgba(0,0,0,0.26)]">
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="shrink-0 text-base font-extrabold tracking-wide text-white sm:text-lg">
          {title || " "}
        </p>

        <SessionRealtimeMetric label="BAL" value={balanceValue} />
        <SessionRealtimeMetric label="DMLL" value="" />
        <SessionRealtimeMetric
          label="RP&L"
          value={formatTickerCurrency(realizedPnlValue)}
          tone={getPnlTone(realizedPnlValue)}
        />
        <SessionRealtimeMetric
          label="UP&L"
          value={formatTickerCurrency(unrealizedPnlValue)}
          tone={getPnlTone(unrealizedPnlValue)}
        />
      </div>
    </div>
  );
}

function SessionRealtimeMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div
      className={cn(
        "shrink-0 inline-flex h-8 min-w-29 items-center rounded-md border px-2.5 text-[0.86rem] font-semibold tracking-wide",
        tone === "neutral" && "border-[#1f3552]/90 bg-[#060C15] text-[#d7e0ef]",
        tone === "positive" && "border-[#72c97d]/55 bg-[#4DAA57] text-[#EAF8EC]",
        tone === "negative" && "border-[#e47d78]/55 bg-[#CE4B46] text-[#FCE9E8]"
      )}
    >
      <span className="opacity-95">{label}:</span>
      <span className="ml-2">{value || " "}</span>
    </div>
  );
}

function normalizeSessionStatus(status: string | undefined): SessionStatus {
  const normalized = (status || "").trim().toUpperCase();
  return normalized || "IN_PROGRESS";
}

function isEditableSessionStatus(status: string | undefined): boolean {
  const normalized = normalizeSessionStatus(status);
  return (
    normalized === "IN_PROGRESS" ||
    normalized === "DRAFT" ||
    normalized === "ACTIVE" ||
    normalized === "OPEN"
  );
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

function toTradingViewSymbol(symbol?: string) {
  const normalized = normalizeContractSymbol(symbol);
  if (!normalized) return "FX:EURUSD";

  if (normalized.includes(":")) return normalized;
  if (normalized === "EURUSD") return "FX:EURUSD";
  if (normalized === "BTCUSD") return "BITSTAMP:BTCUSD";
  if (normalized === "NASDAQ") return "NASDAQ:NDX";
  if (normalized === "XAUUSD") return "OANDA:XAUUSD";
  if (normalized === "GBPUSD") return "FX:GBPUSD";
  if (normalized === "USDJPY") return "FX:USDJPY";
  return "FX:EURUSD";
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

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const sanitized = trimmed.replace(/[^\d.,-]/g, "");
  if (!sanitized) return null;

  let normalized = sanitized;

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount === 1) {
      const [whole, decimal] = normalized.split(",");
      if (decimal && decimal.length <= 2) {
        normalized = `${whole}.${decimal}`;
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPnlTone(value: number | null): "neutral" | "positive" | "negative" {
  if (value === null) return "neutral";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function formatTickerCurrency(value: number | null) {
  if (value === null) return "";

  const absolute = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absolute);

  if (value < 0) {
    return `-$${formatted}`;
  }

  return `$${formatted}`;
}

function normalizeContractSymbol(symbol: string | undefined | null) {
  if (!symbol) return "";

  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return "";

  if (normalized.includes(":")) {
    const [, contract] = normalized.split(":");
    if (!contract) return normalized;
    if (contract === "NDX") return "NASDAQ";
    return contract;
  }

  if (normalized === "NDX") return "NASDAQ";
  return normalized;
}

function extractSymbolFromTradingViewMessage(data: unknown): string | null {
  let payload: unknown = data;

  if (typeof payload === "string") {
    const rawPayload = payload;

    try {
      payload = JSON.parse(rawPayload);
    } catch {
      const direct = findSymbolInString(rawPayload);
      return direct;
    }
  }

  return findSymbolInUnknown(payload);
}

function findSymbolInUnknown(payload: unknown): string | null {
  if (!payload) return null;

  if (typeof payload === "string") {
    return findSymbolInString(payload);
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findSymbolInUnknown(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const preferredKeys = [
    "symbol",
    "symbolName",
    "proName",
    "full_name",
    "ticker",
    "tickerid",
    "name",
  ];

  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string") {
      const found = findSymbolInString(value);
      if (found) return found;
    }
  }

  for (const value of Object.values(record)) {
    const found = findSymbolInUnknown(value);
    if (found) return found;
  }

  return null;
}

function findSymbolInString(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;

  const exchangeMatch = normalized.match(/[A-Z0-9_]+:[A-Z0-9._-]+/);
  if (exchangeMatch) return exchangeMatch[0];

  const directMatch = normalized.match(/\b(EURUSD|BTCUSD|NASDAQ|NDX|XAUUSD|GBPUSD|USDJPY)\b/);
  if (directMatch) return directMatch[0];

  return null;
}

function buildSessionSwitchLabel(
  name: string | undefined | null,
  marketSymbol: string | undefined | null,
  timeframe: string | undefined | null
) {
  const baseName = (name || "Session").trim() || "Session";
  const symbol = (normalizeContractSymbol(marketSymbol) || "--").trim();
  const timeframeLabel = (timeframe || "--").trim() || "--";
  return `${baseName} · ${symbol} · ${timeframeLabel}`;
}
