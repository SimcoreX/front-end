import { request } from "@/lib/http/client";
import type {
  HistoryOutcomeCardSummaryResponse,
  HistoryOutcomeCardsSummaryResponse,
  HistoryTradesApiResponse,
  HistoryTradesQuery,
  HistoryTradesResponse,
  HistoryTradesSummaryResponse,
  HistoryTradeItemResponse,
} from "@/lib/types/history";

const TRADES_HISTORY_BASE_PATH = "/api/v1/trades/history";

export function getHistoryTrades(query: HistoryTradesQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? query.limit ?? 20;
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.symbol) params.set("symbol", query.symbol);
  if (query.performance) params.set("performance", query.performance);

  const path = params.size
    ? `${TRADES_HISTORY_BASE_PATH}?${params.toString()}`
    : TRADES_HISTORY_BASE_PATH;

  return request<HistoryTradesApiResponse>(path, {
    method: "GET",
    auth: true,
  }).then((response) => {
    return apiTradesHistoryToViewModel(response, {
      requestedPage: page,
      requestedPageSize: pageSize,
    });
  });
}

type HistoryMapperOptions = {
  requestedPage: number;
  requestedPageSize: number;
};

export function apiTradesHistoryToViewModel(
  response: HistoryTradesApiResponse,
  options: HistoryMapperOptions
): HistoryTradesResponse {
  if (!isRecord(response)) {
    console.error("[history] invalid payload: response is not an object", response);
    throw new Error("Invalid trades history payload.");
  }

  if (!Array.isArray(response.data)) {
    console.error("[history] invalid payload: data is not an array", response);
    throw new Error("Invalid trades history payload: missing data array.");
  }

  if (!isRecord(response.summary)) {
    console.error("[history] invalid payload: summary is not an object", response);
    throw new Error("Invalid trades history payload: missing summary object.");
  }

  const resolvedPage = toPositiveIntOrFallback(response.page, options.requestedPage);
  const resolvedPageSize = toPositiveIntOrFallback(
    response.pageSize ?? response.limit,
    options.requestedPageSize
  );
  const total = toNonNegativeIntOrFallback(response.total, 0);

  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    total,
    hasNextPage: Boolean(response.hasNextPage),
    summary: mapHistorySummary(response.summary),
    data: response.data.map(mapHistoryTradeItem),
  };
}

function mapHistorySummary(summary: HistoryTradesSummaryResponse) {
  return {
    totalTrades: toNonNegativeIntOrFallback(summary.totalTrades, 0),
    buyTrades: toNullableNumber(summary.buyTrades),
    sellTrades: toNullableNumber(summary.sellTrades),
    buyPercentage: toNullableNumber(summary.buyPercentage),
    sellPercentage: toNullableNumber(summary.sellPercentage),
    wins: toNullableNumber(summary.wins),
    losses: toNullableNumber(summary.losses),
    grossPnl: toNullableNumber(summary.grossPnl),
    netPnl: toNullableNumber(summary.netPnl),
    outcomeCards: mapOutcomeCardsSummary(summary.outcomeCards),
  };
}

function mapOutcomeCardsSummary(cards: HistoryOutcomeCardsSummaryResponse | null | undefined) {
  if (!isRecord(cards)) return null;

  return {
    winners: mapOutcomeCardSummary(cards.winners),
    losers: mapOutcomeCardSummary(cards.losers),
  };
}

function mapOutcomeCardSummary(card: HistoryOutcomeCardSummaryResponse | null | undefined) {
  if (!isRecord(card)) {
    return {
      total: null,
      bestPnl: null,
      worstPnl: null,
      averagePnl: null,
      averageDurationMs: null,
      maxConsecutive: null,
      avgConsecutive: null,
    };
  }

  return {
    total: toNullableNumber(card.total),
    bestPnl: toNullableNumber(card.bestPnl),
    worstPnl: toNullableNumber(card.worstPnl),
    averagePnl: toNullableNumber(card.averagePnl),
    averageDurationMs: toNullableNumber(card.averageDurationMs),
    maxConsecutive: toNullableNumber(card.maxConsecutive),
    avgConsecutive: toNullableNumber(card.avgConsecutive),
  };
}

function mapHistoryTradeItem(trade: HistoryTradeItemResponse) {
  return {
    id: typeof trade.id === "string" ? trade.id : "",
    symbol: toNullableString(trade.symbol),
    side: toNullableString(trade.side),
    performance: toNullableString(trade.performance),
    status: toNullableString(trade.status),
    grossPnl: toNullableNumber(trade.grossPnl),
    netPnl: toNullableNumber(trade.netPnl),
    pnl: toNullableNumber(trade.pnl),
    openedAt: toNullableString(trade.openedAt),
    closedAt: toNullableString(trade.closedAt),
    createdAt: toNullableString(trade.createdAt),
    sessionId: toNullableString(trade.sessionId),
    session: mapSession(trade.session),
  };
}

function mapSession(session: HistoryTradeItemResponse["session"]) {
  if (typeof session === "string") return session;
  if (!isRecord(session)) return null;

  return {
    id: toOptionalString(session.id),
    name: toOptionalString(session.name),
    marketSymbol: toOptionalString(session.marketSymbol),
    timeframe: toOptionalString(session.timeframe),
    status: toOptionalString(session.status),
  };
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toPositiveIntOrFallback(value: unknown, fallback: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return Math.floor(normalized);
}

function toNonNegativeIntOrFallback(value: unknown, fallback: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return Math.floor(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
