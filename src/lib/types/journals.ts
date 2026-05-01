export type JournalScope = "day" | "session" | "trade";

export type DayJournal = {
  id: string;
  tradingDay: string;
  timezone: string;
  scope: JournalScope;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
  createdAt?: string;
};

export type GetDayJournalResponse = {
  data: DayJournal | null;
};

export type CreateJournalPayload = {
  tradingDay: string;
  timezone: string;
  scope: "day";
  title?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
};

export type UpdateJournalPayload = {
  title?: string | null;
  content?: string;
  metadata?: Record<string, unknown> | null;
};

export type DeleteJournalResponse = {
  success: boolean;
};

export type ListJournalsQuery = {
  page?: number;
  limit?: number;
  sortBy?: "tradingDay" | "updatedAt" | "createdAt";
  sortOrder?: "asc" | "desc";
  scope?: JournalScope;
  timezone?: string;
};

export type PaginatedJournalsApiResponse = {
  data: DayJournal[];
  page: number;
  limit: number;
  total: number;
  hasNextPage?: boolean;
};

export type PaginatedJournalsResponse = {
  data: DayJournal[];
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
};
