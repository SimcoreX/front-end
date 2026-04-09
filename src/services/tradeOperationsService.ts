import {
  submitTradeOperation as submitTradeOperationApi,
  toBackendTradeOperationPayload,
  toFrontendTradeOperationResponse,
} from "@/lib/api/trades";
import type {
  BackendTradeOperationPayload,
  BackendTradeOperationResponse,
  TradeOperationPayload,
  TradeOperationResponse,
} from "@/lib/types/trades";

export type { TradeOperationPayload, TradeOperationResponse };
export type { BackendTradeOperationPayload, BackendTradeOperationResponse };

export { toBackendTradeOperationPayload, toFrontendTradeOperationResponse };

export async function submitTradeOperation(payload: TradeOperationPayload, sessionId?: string) {
  if (!sessionId) {
    return {
      id: "local-preview",
      status: "queued" as const,
    };
  }

  return submitTradeOperationApi(payload, sessionId);
}
