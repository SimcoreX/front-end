export type MarketSymbolItem = {
  symbol: string;
  label: string;
  market: string;
  active: boolean;
};

export type MarketSymbolsResponse = {
  data: MarketSymbolItem[];
};

export type MarketSymbolsQuery = {
  search?: string;
  market?: string;
};

export type ReferenceSessionItem = {
  value: string;
  label: string;
};

export type ReferenceSessionsResponse = {
  data: ReferenceSessionItem[];
};
