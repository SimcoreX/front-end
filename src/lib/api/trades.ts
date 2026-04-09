import { request } from "@/lib/http/client";
import type {
  BackendTradeOperationPayload,
  BackendTradeOperationResponse,
  CompleteSessionPayload,
  CreateSessionPayload,
  ListSessionsQuery,
  PaginatedSessionsApiResponse,
  PaginatedSessionsResponse,
  SessionAnalyticsQuery,
  SessionAnalyticsResponse,
  SessionDetailResponse,
  SessionRecordResponse,
  TradeOperationPayload,
  TradeOperationResponse,
} from "@/lib/types/trades";

const SESSIONS_BASE_PATH = "/api/v1/sessions";
const TRADE_OPERATIONS_BASE_PATH = "/api/v1/trades/operations";

export function createSession(payload: CreateSessionPayload) {
  const normalizedPayload: CreateSessionPayload = {
    ...payload,
    marketSymbol: payload.marketSymbol.trim().toUpperCase(),
    timeframe: payload.timeframe.trim().toUpperCase(),
  };

  return request<SessionRecordResponse>(SESSIONS_BASE_PATH, {
    method: "POST",
    body: normalizedPayload,
    auth: true,
  });
}

export function listSessions(query: ListSessionsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? query.limit ?? 20;
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (query.status) params.set("status", query.status);
  if (query.symbol) params.set("symbol", query.symbol);
  if (query.timeframe) params.set("timeframe", query.timeframe);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortOrder) params.set("sortOrder", query.sortOrder);
  if (query.timezone) params.set("timezone", query.timezone);

  const path = params.size ? `${SESSIONS_BASE_PATH}?${params.toString()}` : SESSIONS_BASE_PATH;

  return request<PaginatedSessionsApiResponse>(path, {
    method: "GET",
    auth: true,
  }).then((response) => {
    const resolvedPage = response.page ?? page;
    const resolvedPageSize = response.pageSize ?? response.limit ?? pageSize;
    const hasNextPage =
      response.hasNextPage ?? resolvedPage * resolvedPageSize < response.total;

    return {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: response.total,
      hasNextPage,
      data: response.data,
    };
  });
}

export function getSessionAnalytics(query: SessionAnalyticsQuery = {}) {
  const params = new URLSearchParams();

  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.symbol) params.set("symbol", query.symbol);
  if (query.timezone) params.set("timezone", query.timezone);

  const path = params.size
    ? `${SESSIONS_BASE_PATH}/analytics?${params.toString()}`
    : `${SESSIONS_BASE_PATH}/analytics`;

  return request<SessionAnalyticsResponse>(path, {
    method: "GET",
    auth: true,
  });
}

export function getSessionById(sessionId: string) {
  return request<SessionDetailResponse>(`${SESSIONS_BASE_PATH}/${sessionId}`, {
    method: "GET",
    auth: true,
  });
}

export function completeSession(sessionId: string, payload: CompleteSessionPayload) {
  return request<SessionRecordResponse>(`${SESSIONS_BASE_PATH}/${sessionId}/complete`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function toBackendTradeOperationPayload(
  payload: TradeOperationPayload,
  sessionId: string
): BackendTradeOperationPayload {
  return {
    sessionId,
    symbol: payload.symbol?.trim() ? payload.symbol.trim().toUpperCase() : undefined,
    side: payload.side,
    quantity: payload.quantity ?? 1,
    entryPrice: payload.entryPrice,
    exitPrice: payload.exitPrice,
    fees: payload.fees,
    grossPnl: payload.grossPnl,
    netPnl: payload.netPnl,
    openedAt: payload.openedAt,
    closedAt: payload.closedAt,
    performance: payload.performance,
    notes: payload.notes,
  };
}

export function toFrontendTradeOperationResponse(
  payload: BackendTradeOperationResponse
): TradeOperationResponse {
  const status =
    payload.operationStatus === "queued" || payload.status === "queued"
      ? "queued"
      : "accepted";

  return {
    id: payload.id,
    status,
  };
}

export async function submitTradeOperation(
  payload: TradeOperationPayload,
  sessionId: string
): Promise<TradeOperationResponse> {
  const backendPayload = toBackendTradeOperationPayload(payload, sessionId);
  const backendResponse = await request<BackendTradeOperationResponse>(
    TRADE_OPERATIONS_BASE_PATH,
    {
      method: "POST",
      body: backendPayload,
      auth: true,
    }
  );

  return toFrontendTradeOperationResponse(backendResponse);
}
