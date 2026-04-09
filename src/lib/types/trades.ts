export type TradeOperationPayload = {
  symbol: string;
  side: "buy" | "sell";
  quantity?: number;
  entryPrice: number;
  exitPrice?: number;
  fees?: number;
  grossPnl?: number;
  netPnl?: number;
  openedAt?: string;
  closedAt?: string;
  performance?: "open" | "win" | "loss" | "breakeven";
  marketPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
  occurredAt?: string;
};

export type TradeOperationResponse = {
  id: string;
  status: "accepted" | "queued";
};

export type BackendTradeOperationPayload = {
  sessionId: string;
  symbol?: string;
  side: "buy" | "sell";
  quantity?: number;
  entryPrice: number;
  exitPrice?: number;
  fees?: number;
  grossPnl?: number;
  netPnl?: number;
  openedAt?: string;
  closedAt?: string;
  performance?: "open" | "win" | "loss" | "breakeven";
  notes?: string;
};

export type BackendTradeOperationResponse = {
  id: string;
  status?: string;
  operationStatus?: "accepted" | "queued" | string;
  sessionId?: string;
  performance?: "open" | "win" | "loss" | "breakeven";
  entryPrice?: number;
  netPnl?: number;
};

export type CreateSessionPayload = {
  name: string;
  marketSymbol: string;
  timeframe: string;
  startedAt?: string;
  accountBalanceStart: number;
};

export type SessionStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELED" | string;

export type SessionSlot = "asia" | "london" | "ny" | string;

export type ListSessionsQuery = {
  page?: number;
  pageSize?: number;
  limit?: number;
  status?: SessionStatus;
  symbol?: string;
  timeframe?: string;
  from?: string;
  to?: string;
  sortBy?: "startedAt" | "createdAt" | "updatedAt" | string;
  sortOrder?: "asc" | "desc" | string;
  timezone?: string;
};

export type SessionAnalyticsQuery = {
  from?: string;
  to?: string;
  symbol?: string;
  timezone?: string;
};

export type SessionAnalyticsSummary = {
  totalTrades: number;
  wins: number;
  losses: number;
  successRate: number;
  totalPnl: number;
  timeInvestedMinutes: number;
  completedSessions: number;
  activeSessions: number;
};

export type SessionAnalyticsMonthPoint = {
  month: string;
  value: number;
};

export type SessionAnalyticsSymbolPoint = {
  symbol: string;
  value: number;
};

export type SessionAnalyticsCharts = {
  timeByMonth: SessionAnalyticsMonthPoint[];
  successByMonth: SessionAnalyticsMonthPoint[];
  tradesBySymbol: SessionAnalyticsSymbolPoint[];
};

export type SessionAnalyticsResponse = {
  summary: SessionAnalyticsSummary;
  charts: SessionAnalyticsCharts;
};

export type SessionTradeSummary = {
  id: string;
  side: "buy" | "sell" | string;
  status: "open" | "closed" | string;
  performance?: "open" | "win" | "loss" | "breakeven" | string;
  openedAt?: string;
  closedAt?: string | null;
  quantity?: number;
  entryPrice?: number;
  exitPrice?: number | null;
  netPnl?: number;
};

export type SessionRecordResponse = {
  id: string;
  userId: string;
  name: string;
  marketSymbol: string;
  sessionSlot?: SessionSlot;
  timeframe: string;
  status: SessionStatus;
  startDate: string;
  endDate: string | null;
  startedAt: string;
  endedAt: string | null;
  accountBalanceStart: number;
  accountBalanceEnd: number | null;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  netPnl: number;
  timeInvestedMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type SessionDetailResponse = SessionRecordResponse & {
  trades?: SessionTradeSummary[];
};

export type PaginatedSessionsApiResponse = {
  page: number;
  limit?: number;
  pageSize?: number;
  total: number;
  totalPages?: number;
  hasNextPage?: boolean;
  data: SessionRecordResponse[];
};

export type PaginatedSessionsResponse = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  data: SessionRecordResponse[];
};

export type CompleteSessionPayload = {
  accountBalanceEnd: number;
  endedAt?: string;
};
