"use client";

import { getMe, tryRefreshAuthSession } from "@/lib/api/auth";
import { ApiError } from "@/lib/types/api";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState } from "react";

export function useAuthBootstrap() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    async function bootstrap() {
      if (!accessToken) {
        const refreshed = await tryRefreshAuthSession();
        if (!refreshed) {
          if (!cancelled) setBootstrapped(true);
          return;
        }

        try {
          const me = await getMe();
          if (!cancelled) {
            setUser(me);
            setBootstrapped(true);
          }
        } catch {
          clearSession();
          if (!cancelled) setBootstrapped(true);
        }
        return;
      }

      try {
        const me = await getMe();
        if (!cancelled) {
          setUser(me);
          setBootstrapped(true);
        }
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && error.statusCode === 401) {
          const refreshed = await tryRefreshAuthSession();
          if (refreshed) {
            try {
              const me = await getMe();
              if (!cancelled) {
                setUser(me);
                setBootstrapped(true);
              }
              return;
            } catch {
              clearSession();
              setBootstrapped(true);
              return;
            }
          }
        }

        clearSession();
        setBootstrapped(true);
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
