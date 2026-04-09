import { request } from "@/lib/http/client";

export type FinancialNewsItem = {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  articleUrl: string;
  sourceName: string;
  publishedAt: string;
  topic: NewsTopic;
};

export type NewsTopic = "all" | "stocks" | "forex" | "commodities";

export type NewsSource = "backend" | "gnews" | "mock" | string;

export type FinancialNewsResult = {
  articles: FinancialNewsItem[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  source: NewsSource;
};

type FetchFinancialNewsParams = {
  page: number;
  pageSize?: number;
  language: string;
  topic?: NewsTopic;
  signal?: AbortSignal;
};

type BackendNewsResponse = {
  articles?: FinancialNewsItem[];
  page?: number;
  pageSize?: number;
  total?: number;
  hasNextPage?: boolean;
  source?: NewsSource;
};

const NEWS_BASE_PATH = "/api/v1/news";
const DEFAULT_PAGE_SIZE = 10;

export async function fetchFinancialNews({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  language,
  topic = "all",
  signal,
}: FetchFinancialNewsParams): Promise<FinancialNewsResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(50, pageSize));

  const params = new URLSearchParams({
    page: String(safePage),
    pageSize: String(safePageSize),
    language: mapNewsLanguage(language),
    topic,
  });

  const response = await request<BackendNewsResponse>(`${NEWS_BASE_PATH}?${params.toString()}`, {
    method: "GET",
    auth: true,
    signal,
  });

  const articles = response.articles ?? [];
  const normalizedPage = response.page ?? safePage;
  const normalizedPageSize = response.pageSize ?? safePageSize;
  const normalizedTotal = response.total ?? articles.length;
  const normalizedHasNext =
    response.hasNextPage ?? normalizedPage * normalizedPageSize < normalizedTotal;

  return {
    articles,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total: normalizedTotal,
    hasNextPage: normalizedHasNext,
    source: response.source ?? "backend",
  };
}

function mapNewsLanguage(language: string) {
  const normalized = language.toLowerCase();
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("es")) return "es";
  return "en";
}
