export type HistoryPerformanceFilter = "all" | "best" | "worst";

export type HistoryTradesQuery = {
  page?: number;
  pageSize?: number;
  limit?: number;
  from?: string;
  to?: string;
  symbol?: string;
  performance?: "win" | "loss";
};

export type HistoryTradeItemResponse = {
  id: string;
  symbol?: string;
  side?: "buy" | "sell" | string;
  performance?: "open" | "win" | "loss" | "breakeven" | string;
  status?: "open" | "closed" | string;
  grossPnl?: number;
  netPnl?: number;
  pnl?: number;
  openedAt?: string;
  closedAt?: string | null;
  createdAt?: string;
  sessionId?: string;
  session?:
    | string
    | {
        id?: string;
        name?: string;
        marketSymbol?: string;
        timeframe?: string;
        status?: string;
      };
};

export type HistoryTradesSummaryResponse = {
  totalTrades: number;
  buyTrades?: number;
  sellTrades?: number;
  buyPercentage?: number;
  sellPercentage?: number;
  wins?: number;
  losses?: number;
  grossPnl?: number;
  netPnl?: number;
};

export type HistoryTradesApiResponse = {
  page: number;
  limit?: number;
  pageSize?: number;
  total: number;
  totalPages?: number;
  hasNextPage?: boolean;
  summary: HistoryTradesSummaryResponse;
  data: HistoryTradeItemResponse[];
};

export type HistoryTradesResponse = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  summary: HistoryTradesSummaryResponse;
  data: HistoryTradeItemResponse[];
};
