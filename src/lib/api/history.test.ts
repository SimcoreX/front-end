import { describe, expect, it } from "vitest";
import { apiTradesHistoryToViewModel } from "@/lib/api/history";
import type { HistoryTradesApiResponse } from "@/lib/types/history";

describe("history mapper", () => {
  it("maps complete payload and keeps hasNextPage from backend", () => {
    const payload: HistoryTradesApiResponse = {
      page: 2,
      limit: 50,
      total: 222,
      hasNextPage: true,
      summary: {
        totalTrades: 222,
        wins: 99,
        losses: 120,
        netPnl: 150257340,
        outcomeCards: {
          winners: {
            total: 99,
            bestPnl: 16189.45,
            averagePnl: 168.2,
            averageDurationMs: 879000000,
            maxConsecutive: 37,
            avgConsecutive: 16.5,
          },
          losers: {
            total: 120,
            worstPnl: -500,
            averagePnl: -18.9,
            averageDurationMs: 6240000,
            maxConsecutive: 44,
            avgConsecutive: 20,
          },
        },
      },
      data: [
        {
          id: "tr_1",
          symbol: "eurusd",
          performance: "win",
          status: "closed",
          netPnl: 25.5,
          openedAt: "2026-04-23T10:00:00.000Z",
          closedAt: "2026-04-23T10:15:00.000Z",
        },
      ],
    };

    const viewModel = apiTradesHistoryToViewModel(payload, {
      requestedPage: 1,
      requestedPageSize: 20,
    });

    expect(viewModel.page).toBe(2);
    expect(viewModel.pageSize).toBe(50);
    expect(viewModel.hasNextPage).toBe(true);
    expect(viewModel.summary.outcomeCards?.winners.bestPnl).toBe(16189.45);
    expect(viewModel.summary.outcomeCards?.losers.worstPnl).toBe(-500);
    expect(viewModel.data[0].symbol).toBe("eurusd");
  });

  it("preserves nullable metrics instead of coercing to zero", () => {
    const payload: HistoryTradesApiResponse = {
      page: 1,
      limit: 20,
      total: 1,
      hasNextPage: false,
      summary: {
        totalTrades: 1,
        netPnl: null,
        outcomeCards: {
          winners: {
            total: 1,
            bestPnl: null,
            averagePnl: null,
            averageDurationMs: null,
            maxConsecutive: null,
            avgConsecutive: null,
          },
          losers: {
            total: null,
            worstPnl: null,
            averagePnl: null,
            averageDurationMs: null,
            maxConsecutive: null,
            avgConsecutive: null,
          },
        },
      },
      data: [
        {
          id: "tr_2",
          symbol: null,
          netPnl: null,
          performance: null,
          status: null,
          openedAt: null,
          closedAt: null,
          createdAt: null,
        },
      ],
    };

    const viewModel = apiTradesHistoryToViewModel(payload, {
      requestedPage: 1,
      requestedPageSize: 20,
    });

    expect(viewModel.hasNextPage).toBe(false);
    expect(viewModel.summary.netPnl).toBeNull();
    expect(viewModel.summary.outcomeCards?.winners.bestPnl).toBeNull();
    expect(viewModel.summary.outcomeCards?.losers.total).toBeNull();
    expect(viewModel.data[0].netPnl).toBeNull();
  });

  it("throws when summary or data are missing", () => {
    const invalidPayload = {
      page: 1,
      limit: 20,
      total: 0,
      hasNextPage: false,
      summary: null,
      data: null,
    } as unknown as HistoryTradesApiResponse;

    expect(() =>
      apiTradesHistoryToViewModel(invalidPayload, {
        requestedPage: 1,
        requestedPageSize: 20,
      })
    ).toThrowError(/Invalid trades history payload/i);
  });
});
