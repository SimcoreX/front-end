import { request } from "@/lib/http/client";
import type {
  MarketSymbolsQuery,
  MarketSymbolsResponse,
  ReferenceSessionsResponse,
} from "@/lib/types/reference";

const MARKETS_SYMBOLS_PATH = "/api/v1/markets/symbols";
const REFERENCE_SESSIONS_PATH = "/api/v1/reference/sessions";

export function getMarketSymbols(query: MarketSymbolsQuery = {}) {
  const params = new URLSearchParams();

  if (query.search) params.set("search", query.search);
  if (query.market) params.set("market", query.market);

  const path = params.size
    ? `${MARKETS_SYMBOLS_PATH}?${params.toString()}`
    : MARKETS_SYMBOLS_PATH;

  return request<MarketSymbolsResponse>(path, {
    method: "GET",
    auth: true,
  });
}

export function getReferenceSessions() {
  return request<ReferenceSessionsResponse>(REFERENCE_SESSIONS_PATH, {
    method: "GET",
    auth: false,
  });
}
