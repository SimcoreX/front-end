"use client";

import { login, logout, register } from "@/lib/api/auth";
import { ApiError } from "@/lib/types/api";
import type { AuthCredentialsPayload } from "@/lib/types/auth";
import { useAuthStore } from "@/stores/authStore";
import { useCallback, useState } from "react";

export function useAuthActions() {
  const clearSession = useAuthStore((state) => state.clearSession);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const loginAction = useCallback(async (payload: AuthCredentialsPayload) => {
    setIsLoading(true);
    setError(null);
    try {
      return await login(payload);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError);
      }
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerAction = useCallback(async (payload: AuthCredentialsPayload) => {
    setIsLoading(true);
    setError(null);
    try {
      return await register(payload);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError);
      }
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logoutAction = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await logout(refreshToken ? { refreshToken } : undefined);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError);
      }
    } finally {
      clearSession();
      setIsLoading(false);
    }
  }, [clearSession, refreshToken]);

  return {
    isLoading,
    error,
    loginAction,
    registerAction,
    logoutAction,
  };
}
