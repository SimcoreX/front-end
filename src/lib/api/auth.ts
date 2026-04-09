import { request } from "@/lib/http/client";
import { tryRefreshAuthSession } from "@/lib/auth/refreshSession";
import type {
  AuthCredentialsPayload,
  AuthSessionResponse,
  AuthUser,
  LogoutResponse,
  RefreshTokenPayload,
} from "@/lib/types/auth";
import { useAuthStore } from "@/stores/authStore";

const AUTH_BASE_PATH = "/api/v1/auth";

export async function login(payload: AuthCredentialsPayload) {
  const response = await request<AuthSessionResponse>(`${AUTH_BASE_PATH}/login`, {
    method: "POST",
    body: payload,
    auth: false,
    retryOnUnauthorized: false,
  });

  useAuthStore.getState().setSession(response);
  return response;
}

export async function register(payload: AuthCredentialsPayload) {
  const response = await request<AuthSessionResponse>(`${AUTH_BASE_PATH}/register`, {
    method: "POST",
    body: payload,
    auth: false,
    retryOnUnauthorized: false,
  });

  useAuthStore.getState().setSession(response);
  return response;
}

export function getMe() {
  return request<AuthUser>(`${AUTH_BASE_PATH}/me`, {
    method: "GET",
    auth: true,
  });
}

export function refresh(payload?: RefreshTokenPayload) {
  return request<AuthSessionResponse>(`${AUTH_BASE_PATH}/refresh`, {
    method: "POST",
    body: payload,
    auth: false,
    retryOnUnauthorized: false,
  });
}

export function logout(payload?: RefreshTokenPayload) {
  return request<LogoutResponse>(`${AUTH_BASE_PATH}/logout`, {
    method: "POST",
    body: payload,
    auth: true,
    retryOnUnauthorized: false,
  });
}

export { tryRefreshAuthSession };
