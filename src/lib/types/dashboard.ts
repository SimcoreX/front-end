export type DashboardOverviewQuery = {
  from?: string;
  to?: string;
  timezone?: string;
};

export type HistoricalTimeSummary = {
  years: number;
  months: number;
  days: number;
  label: string;
  sessionCount: number;
};

export type DashboardOverviewSummary = {
  timeInvestedMinutes: number;
  overallWinRate?: number;
  totalTrades: number;
  completedSessions: number;
  historyCount: number;
  historicalTime?: HistoricalTimeSummary;
};

export type DashboardMonthPoint = {
  month: string;
  value: number;
};

export type DashboardWeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DashboardWeekdayPoint = {
  weekday: DashboardWeekdayKey;
  value: number;
};

export type DashboardOverviewCharts = {
  pnlCumulativeByMonth: DashboardMonthPoint[];
  marketTrackerByMonth: DashboardMonthPoint[];
  tradesByWeekday: DashboardWeekdayPoint[];
  winRateByWeekday: DashboardWeekdayPoint[];
};

export type DashboardOverviewResponse = {
  summary: DashboardOverviewSummary;
  charts: DashboardOverviewCharts;
  updatedAt: string;
};
