import { describe, expect, it } from "vitest";
import {
  toBackendTradeOperationPayload,
  toFrontendTradeOperationResponse,
} from "@/lib/api/trades";

describe("trades adapters", () => {
  it("maps frontend payload to backend payload", () => {
    const payload = toBackendTradeOperationPayload(
      {
        symbol: "FX:EURUSD",
        side: "buy",
        quantity: 1,
        entryPrice: 1.1234,
        marketPrice: 1.125,
        occurredAt: "2026-03-22T12:00:00.000Z",
        notes: "test",
        stopLoss: 1.12,
        takeProfit: 1.13,
      },
      "session-1"
    );

    expect(payload).toEqual({
      sessionId: "session-1",
      symbol: "FX:EURUSD",
      side: "buy",
      quantity: 1,
      entryPrice: 1.1234,
      notes: "test",
    });
    expect(payload).not.toHaveProperty("marketPrice");
    expect(payload).not.toHaveProperty("occurredAt");
    expect(payload).not.toHaveProperty("stopLoss");
    expect(payload).not.toHaveProperty("takeProfit");
  });

  it("maps backend response status to frontend expected status", () => {
    expect(toFrontendTradeOperationResponse({ id: "a", status: "queued" })).toEqual({
      id: "a",
      status: "queued",
    });

    expect(toFrontendTradeOperationResponse({ id: "b", status: "open" })).toEqual({
      id: "b",
      status: "accepted",
    });
  });
});
