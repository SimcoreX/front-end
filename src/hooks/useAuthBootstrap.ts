"use client";

import { getMe, tryRefreshAuthSession } from "@/lib/api/auth";
import { ApiError } from "@/lib/types/api";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState } from "react";

const AUTH_BOOTSTRAP_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("AUTH_BOOTSTRAP_TIMEOUT"));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function useAuthBootstrap() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    const finishBootstrap = () => {
      if (!cancelled) {
        setBootstrapped(true);
      }
    };

    const refreshWithTimeout = async () => {
      try {
        return await withTimeout(tryRefreshAuthSession(), AUTH_BOOTSTRAP_TIMEOUT_MS);
      } catch {
        return false;
      }
    };

    const getMeWithTimeout = async () => {
      try {
        return await withTimeout(getMe(), AUTH_BOOTSTRAP_TIMEOUT_MS);
      } catch {
        return null;
      }
    };

    async function bootstrap() {
      if (!accessToken) {
        const refreshed = await refreshWithTimeout();
        if (!refreshed) {
          finishBootstrap();
          return;
        }

        const me = await getMeWithTimeout();
        if (!me) {
          clearSession();
          finishBootstrap();
          return;
        }

        if (!cancelled) {
          setUser(me);
        }
        finishBootstrap();
        return;
      }

      try {
        const me = await getMeWithTimeout();
        if (!me) {
          throw new Error("AUTH_GET_ME_FAILED");
        }

        if (!cancelled) {
          setUser(me);
        }
        finishBootstrap();
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && error.statusCode === 401) {
          const refreshed = await refreshWithTimeout();
          if (refreshed) {
            const me = await getMeWithTimeout();
            if (me) {
              if (!cancelled) {
                setUser(me);
              }
              finishBootstrap();
              return;
            }

            clearSession();
            finishBootstrap();
            return;
          }
        }

        clearSession();
        finishBootstrap();
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hydrated, accessToken, setUser, clearSession]);

  return {
    bootstrapped: hydrated && bootstrapped,
  };
}
