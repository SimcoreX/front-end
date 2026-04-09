export type DashboardOverviewQuery = {
  from?: string;
  to?: string;
  timezone?: string;
};

export type DashboardOverviewSummary = {
  timeInvestedMinutes: number;
  totalTrades: number;
  completedSessions: number;
  historyCount: number;
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
