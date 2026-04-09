type TwelveDataValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveDataResponse = {
  status?: string;
  values?: TwelveDataValue[];
  message?: string;
};

export type MarketCandle = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketSeriesResult = {
  symbol: string;
  interval: string;
  candles: MarketCandle[];
  source: "twelve-data" | "mock";
};

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";

export async function fetchMarketSeries(
  symbol: string,
  interval: string,
  outputSize = 60
): Promise<MarketSeriesResult> {
  const apiKey = process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return {
      symbol,
      interval,
      candles: buildMockCandles(),
      source: "mock",
    };
  }

  try {
    const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", String(outputSize));
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url.toString(), { cache: "no-store" });
    const data = (await response.json()) as TwelveDataResponse;

    if (!response.ok || data.status === "error" || !data.values?.length) {
      return {
        symbol,
        interval,
        candles: buildMockCandles(),
        source: "mock",
      };
    }

    const candles = [...data.values]
      .reverse()
      .map((item) => ({
        datetime: item.datetime,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume ?? 0),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.open) &&
          Number.isFinite(item.high) &&
          Number.isFinite(item.low) &&
          Number.isFinite(item.close)
      );

    if (!candles.length) {
      return {
        symbol,
        interval,
        candles: buildMockCandles(),
        source: "mock",
      };
    }

    return {
      symbol,
      interval,
      candles,
      source: "twelve-data",
    };
  } catch {
    return {
      symbol,
      interval,
      candles: buildMockCandles(),
      source: "mock",
    };
  }
}

function buildMockCandles() {
  const now = Date.now();
  const candles: MarketCandle[] = [];
  let lastClose = 102.5;

  for (let index = 0; index < 60; index += 1) {
    const time = new Date(now - (59 - index) * 60_000);
    const wave = Math.sin(index / 4.5) * 0.9;
    const noise = ((index % 5) - 2) * 0.12;
    const close = Math.max(1, lastClose + wave * 0.3 + noise);
    const open = lastClose;
    const high = Math.max(open, close) + 0.18 + (index % 3) * 0.04;
    const low = Math.min(open, close) - 0.17 - (index % 2) * 0.03;

    candles.push({
      datetime: time.toISOString(),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: 180 + (index % 7) * 35,
    });

    lastClose = close;
  }

  return candles;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
