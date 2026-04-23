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
  symbol?: string | null;
  side?: "buy" | "sell" | string;
  performance?: "open" | "win" | "loss" | "breakeven" | string;
  status?: "open" | "closed" | string;
  grossPnl?: number | null;
  netPnl?: number | null;
  pnl?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
  createdAt?: string | null;
  sessionId?: string | null;
  session?:
    | string
    | null
    | {
        id?: string;
        name?: string;
        marketSymbol?: string;
        timeframe?: string;
        status?: string;
      };
};

export type HistoryOutcomeCardSummaryResponse = {
  total?: number | null;
  bestPnl?: number | null;
  worstPnl?: number | null;
  averagePnl?: number | null;
  averageDurationMs?: number | null;
  maxConsecutive?: number | null;
  avgConsecutive?: number | null;
};

export type HistoryOutcomeCardsSummaryResponse = {
  winners?: HistoryOutcomeCardSummaryResponse | null;
  losers?: HistoryOutcomeCardSummaryResponse | null;
};

export type HistoryTradesSummaryResponse = {
  totalTrades: number;
  buyTrades?: number | null;
  sellTrades?: number | null;
  buyPercentage?: number | null;
  sellPercentage?: number | null;
  wins?: number | null;
  losses?: number | null;
  grossPnl?: number | null;
  netPnl?: number | null;
  outcomeCards?: HistoryOutcomeCardsSummaryResponse | null;
};

export type HistoryTradesApiResponse = {
  page?: number;
  limit?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  summary?: HistoryTradesSummaryResponse | null;
  data?: HistoryTradeItemResponse[] | null;
};

export type HistoryOutcomeCardSummaryViewModel = {
  total: number | null;
  bestPnl: number | null;
  worstPnl: number | null;
  averagePnl: number | null;
  averageDurationMs: number | null;
  maxConsecutive: number | null;
  avgConsecutive: number | null;
};

export type HistoryOutcomeCardsSummaryViewModel = {
  winners: HistoryOutcomeCardSummaryViewModel;
  losers: HistoryOutcomeCardSummaryViewModel;
};

export type HistoryTradeItemViewModel = {
  id: string;
  symbol: string | null;
  side: string | null;
  performance: string | null;
  status: string | null;
  grossPnl: number | null;
  netPnl: number | null;
  pnl: number | null;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
  sessionId: string | null;
  session:
    | string
    | {
        id?: string;
        name?: string;
        marketSymbol?: string;
        timeframe?: string;
        status?: string;
      }
    | null;
};

export type HistoryTradesSummaryViewModel = {
  totalTrades: number;
  buyTrades: number | null;
  sellTrades: number | null;
  buyPercentage: number | null;
  sellPercentage: number | null;
  wins: number | null;
  losses: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  outcomeCards: HistoryOutcomeCardsSummaryViewModel | null;
};

export type HistoryTradesResponse = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  summary: HistoryTradesSummaryViewModel;
  data: HistoryTradeItemViewModel[];
};
