import { useAuthStore } from "@/stores/authStore";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getApiBaseUrl() {
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    return "";
  }

  return API_BASE_URL;
}

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
