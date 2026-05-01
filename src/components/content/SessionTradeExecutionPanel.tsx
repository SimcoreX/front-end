"use client";

import { SelectField } from "@/components/forms/SelectField";
import { cn } from "@/lib/classNames";
import type { SessionDetailResponse } from "@/lib/types/trades";
import { useMemo, useState } from "react";

export type SessionContractOption = {
  value: string;
  label: string;
};

export function SessionTradeExecutionPanel({
  session,
  contractOptions,
  selectedContract,
  onContractChange,
  activeSessionOptions,
  selectedSessionId,
  onRequestSessionChange,
}: {
  session: SessionDetailResponse | null;
  contractOptions: SessionContractOption[];
  selectedContract: string;
  onContractChange: (nextContract: string) => void;
  activeSessionOptions: SessionContractOption[];
  selectedSessionId: string;
  onRequestSessionChange: (nextSessionId: string) => void;
}) {
  const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop">("Market");
  const [positionBracketMode, setPositionBracketMode] = useState<"Enabled" | "Disabled">("Enabled");
  const [contractsInput, setContractsInput] = useState("1");
  const [quoteIntent, setQuoteIntent] = useState<"bid" | "ask" | null>(null);

  const latestPrice = useMemo(() => getLatestReferencePrice(session), [session]);
  const spread = latestPrice !== null ? 0.3 : null;
  const bidPrice = latestPrice !== null ? latestPrice - 0.1 : null;
  const askPrice = latestPrice !== null ? latestPrice + 0.1 : null;
  const contracts = useMemo(() => normalizeContractsInput(contractsInput), [contractsInput]);

  const hasOpenPosition = (session?.trades || []).some((trade) => {
    const normalizedStatus = (trade.status || "").toLowerCase();
    const normalizedPerformance = (trade.performance || "").toLowerCase();
    return normalizedStatus === "open" || normalizedPerformance === "open";
  });

  const chips = [1, 3, 5, 10, 15];

  const handleContractsInputChange = (rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, "");
    if (!digitsOnly) {
      setContractsInput("");
      return;
    }

    const parsed = Number(digitsOnly);
    const clamped = clampContracts(parsed);
    setContractsInput(String(clamped));
  };

  const handleContractsBlur = () => {
    setContractsInput(String(clampContracts(normalizeContractsInput(contractsInput))));
  };

  const adjustContracts = (delta: number) => {
    setContractsInput(String(clampContracts(contracts + delta)));
  };

  const setContractsDirect = (nextValue: number) => {
    setContractsInput(String(clampContracts(nextValue)));
  };

  const handlePickQuote = (side: "bid" | "ask") => {
    const pickedPrice = side === "bid" ? bidPrice : askPrice;
    if (pickedPrice === null) return;

    setQuoteIntent(side);
    setOrderType("Limit");
  };

  return (
    <aside className="w-full border-t border-primary-800/80 bg-[#050A12] px-2.5 py-3 xl:h-full xl:w-[304px] xl:shrink-0 xl:border-l xl:border-t-0 xl:px-3">
      <div className="flex h-full flex-col gap-2 overflow-y-auto pr-0.5">
        <SelectField
          label="Contract"
          value={selectedContract}
          onChange={(event) => onContractChange(event.target.value)}
          options={contractOptions}
          compact
          className="h-7 rounded-sm px-2 py-1 text-[0.8rem]"
          name="session-contract"
        />

        <SelectField
          label="Order Type"
          value={orderType}
          onChange={(event) => setOrderType(event.target.value as "Market" | "Limit" | "Stop")}
          options={[
            { value: "Market", label: "Market" },
            { value: "Limit", label: "Limit" },
            { value: "Stop", label: "Stop" },
          ]}
          compact
          className="h-7 rounded-sm px-2 py-1 text-[0.8rem]"
          name="session-order-type"
        />

        <label className="relative flex flex-col gap-1.5 text-[0.78rem] text-primary-100">
          <span className="text-[0.68rem] font-medium uppercase tracking-wide text-primary-300"># of Contracts</span>
          <div className="flex h-7 items-center justify-between rounded-sm border border-secondary-500/40 bg-primary-900/60 px-2 text-[0.8rem] font-medium text-white">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={contractsInput}
              onChange={(event) => handleContractsInputChange(event.target.value)}
              onBlur={handleContractsBlur}
              className="h-full w-full bg-transparent pr-1 text-[0.8rem] font-medium text-white outline-none"
              aria-label="Contracts quantity"
            />
            <div className="flex flex-col text-[0.58rem] leading-[0.62rem] text-primary-200">
              <button
                type="button"
                onClick={() => adjustContracts(1)}
                className="rounded-sm px-0.5 transition hover:text-white"
                aria-label="Increase contracts"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => adjustContracts(-1)}
                className="rounded-sm px-0.5 transition hover:text-white"
                aria-label="Decrease contracts"
              >
                ▼
              </button>
            </div>
          </div>
        </label>

        <div className="rounded-md border border-[#141F2F] bg-[#060B12] px-2.5 py-2">
          <div className="flex items-center justify-between gap-1.5 text-[0.96rem] font-semibold text-[#D9E5F7]">
            <PriceBadge
              label="Bid"
              value={formatOneDecimal(bidPrice)}
              tone="buy"
              isActive={quoteIntent === "bid"}
              onClick={() => handlePickQuote("bid")}
            />
            <div className="text-center leading-tight">
              <p>{formatOneDecimal(latestPrice)}</p>
              <p className="text-[0.88rem] text-[#CED9EA]">{formatOneDecimal(spread)}</p>
            </div>
            <PriceBadge
              label="Ask"
              value={formatOneDecimal(askPrice)}
              tone="sell"
              isActive={quoteIntent === "ask"}
              onClick={() => handlePickQuote("ask")}
            />
          </div>
        </div>

        <SelectField
          label="Active Session"
          value={selectedSessionId}
          onChange={(event) => onRequestSessionChange(event.target.value)}
          options={activeSessionOptions}
          compact
          className="h-7 rounded-sm px-2 py-1 text-[0.76rem]"
          name="session-active-session"
        />

        <p className="py-0.5 text-center text-[0.88rem] font-medium text-[#B7C4DA]">
          {hasOpenPosition ? "Active Position" : "No Active Position"}
        </p>

        <div className="flex items-center justify-center gap-1.5">
          <StepChip label="-" onClick={() => adjustContracts(-1)} />
          {chips.map((chip) => (
            <StepChip
              key={chip}
              label={String(chip)}
              isActive={contracts === chip}
              onClick={() => setContractsDirect(chip)}
            />
          ))}
          <StepChip label="+" onClick={() => adjustContracts(1)} />
        </div>

        <SelectField
          label="Position Bracket"
          value={positionBracketMode}
          onChange={(event) => setPositionBracketMode(event.target.value as "Enabled" | "Disabled")}
          options={[
            { value: "Enabled", label: "Enabled" },
            { value: "Disabled", label: "Disabled" },
          ]}
          compact
          className="h-7 rounded-sm px-2 py-1 text-[0.8rem]"
          name="session-position-bracket"
        />

        <div className="mt-0.5 grid grid-cols-2 gap-1.5">
          <ActionButton tone="buy" label={`BUY +${contracts} @ MARKET`} />
          <ActionButton tone="sell" label={`SELL -${contracts} @ MARKET`} />

          <ActionButton
            tone="muted"
            label={bidPrice !== null ? `JOIN BID ${formatOneDecimal(bidPrice)}` : "JOIN BID"}
            onClick={() => handlePickQuote("bid")}
          />
          <ActionButton
            tone="muted"
            label={askPrice !== null ? `JOIN ASK ${formatOneDecimal(askPrice)}` : "JOIN ASK"}
            onClick={() => handlePickQuote("ask")}
          />

          <ActionButton tone="disabled" label="CLOSE POSITION" />
          <ActionButton tone="disabled" label="REVERSE POSITION" />

          <ActionButton tone="disabled" label="CANCEL ORDERS" className="col-span-2" />

          <ActionButton tone="muted" label="FLATTEN ALL" />
          <ActionButton tone="muted" label="CANCEL ALL" />
        </div>
      </div>
    </aside>
  );
}

function PriceBadge({
  label,
  value,
  tone,
  isActive = false,
  onClick,
}: {
  label: string;
  value: string;
  tone: "buy" | "sell";
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!value}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[0.72rem] font-medium transition",
        !value && "cursor-not-allowed opacity-60",
        tone === "buy" && "border-emerald-500/55 text-emerald-300",
        tone === "sell" && "border-red-500/55 text-red-300",
        value && "hover:bg-white/6",
        isActive && "ring-1 ring-white/40"
      )}
      aria-label={`${label} quote ${value || "unavailable"}`}
    >
      {label}: {value}
    </button>
  );
}

function StepChip({
  label,
  isActive = false,
  onClick,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1 text-[0.72rem] font-semibold transition",
        isActive
          ? "border-[#AAB9CF] bg-[#D8DFEB] text-[#111827]"
          : "border-[#3A4350] bg-[#4A535F] text-[#F2F5FB] hover:bg-[#5A6573]"
      )}
    >
      {label}
    </button>
  );
}

function ActionButton({
  tone,
  label,
  className,
  onClick,
}: {
  tone: "buy" | "sell" | "muted" | "disabled";
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={tone === "disabled"}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md px-1.5 text-[0.72rem] font-bold tracking-wide transition",
        tone === "buy" && "bg-[#4DAA57] text-[#EAF8EC] hover:brightness-110",
        tone === "sell" && "bg-[#CE4B46] text-[#FCE9E8] hover:brightness-110",
        tone === "muted" && "bg-[#656C76] text-[#EDF2FB] hover:bg-[#747D88]",
        tone === "disabled" && "bg-[#50545A] text-[#AEB6C2] opacity-60",
        className
      )}
    >
      {label}
    </button>
  );
}

function getLatestReferencePrice(session: SessionDetailResponse | null): number | null {
  const trades = session?.trades;
  if (!trades?.length) return null;

  const orderedTrades = [...trades].sort((a, b) => {
    const aTimestamp = getTradeTimestamp(a.closedAt || a.openedAt);
    const bTimestamp = getTradeTimestamp(b.closedAt || b.openedAt);
    return bTimestamp - aTimestamp;
  });

  for (const trade of orderedTrades) {
    const entry = toFiniteNumber(trade.entryPrice);
    if (entry !== null) return entry;

    const exit = toFiniteNumber(trade.exitPrice);
    if (exit !== null) return exit;
  }

  return null;
}

function getTradeTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function toFiniteNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function clampContracts(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1000, Math.max(1, Math.round(value)));
}

function normalizeContractsInput(value: string) {
  const parsed = Number(value.replace(/\D/g, ""));
  return clampContracts(parsed);
}

function formatOneDecimal(value: number | null): string {
  if (value === null) return "";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

