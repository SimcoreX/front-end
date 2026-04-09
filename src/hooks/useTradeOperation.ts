"use client";

import { submitTradeOperation } from "@/lib/api/trades";
import { ApiError } from "@/lib/types/api";
import type { TradeOperationPayload } from "@/lib/types/trades";
import { useState } from "react";

function validateTradeOperationPayload(payload: TradeOperationPayload) {
  if (!payload.symbol.trim()) return "trades.apiErrors.symbolRequired";
  if (
    payload.quantity !== undefined &&
    (!Number.isFinite(payload.quantity) || payload.quantity <= 0)
  ) {
    return "trades.apiErrors.invalidQuantity";
  }
  if (!Number.isFinite(payload.entryPrice) || payload.entryPrice <= 0) {
    return "trades.apiErrors.invalidEntryPrice";
  }
  return null;
}

export function useTradeOperation() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function submit(payload: TradeOperationPayload, sessionId: string) {
    const validationErrorKey = validateTradeOperationPayload(payload);
    if (validationErrorKey) {
      setErrorKey(validationErrorKey);
      return null;
    }

    setIsSubmitting(true);
    setErrorKey(null);

    try {
      return await submitTradeOperation(payload, sessionId);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "SESSION_NOT_FOUND") {
          setErrorKey("trades.apiErrors.sessionNotFound");
        } else if (error.statusCode === 401) {
          setErrorKey("auth.errors.unauthorized");
        } else {
          setErrorKey("trades.apiErrors.requestFailed");
        }
      } else {
        setErrorKey("trades.apiErrors.requestFailed");
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    isSubmitting,
    errorKey,
    submit,
    clearError: () => setErrorKey(null),
  };
}
