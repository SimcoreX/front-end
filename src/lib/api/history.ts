import { request } from "@/lib/http/client";
import type {
  HistoryTradesApiResponse,
  HistoryTradesQuery,
  HistoryTradesResponse,
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
    const resolvedPage = response.page ?? page;
    const resolvedPageSize = response.pageSize ?? response.limit ?? pageSize;
    const hasNextPage =
      response.hasNextPage ?? resolvedPage * resolvedPageSize < response.total;

    return {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: response.total,
      hasNextPage,
      summary: response.summary,
      data: response.data,
    };
  });
}
