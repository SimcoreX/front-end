import { getApiBaseUrl } from "@/lib/http/apiBaseUrl";
import { useAuthStore } from "@/stores/authStore";

type RefreshSessionResponse = {
  accessToken: string;
  refreshToken?: string;
  sessionExpiresAt: string;
};

let refreshPromise: Promise<boolean> | null = null;

export function tryRefreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const currentRefreshToken = useAuthStore.getState().refreshToken;
      const apiBaseUrl = getApiBaseUrl();

      try {
        const payload = currentRefreshToken ? { refreshToken: currentRefreshToken } : {};
        const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          useAuthStore.getState().clearSession();
          return false;
        }

        const refreshed = (await response.json()) as RefreshSessionResponse;
        useAuthStore.getState().setSession(refreshed);
        return true;
      } catch {
        useAuthStore.getState().clearSession();
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}
