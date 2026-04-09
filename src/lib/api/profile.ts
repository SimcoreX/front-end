import { request } from "@/lib/http/client";
import { getMe } from "@/lib/api/auth";
import type { AuthUser } from "@/lib/types/auth";

export type UpdateProfilePayload = {
  name?: string;
  avatar?: string;
  language?: "pt-BR" | "en-US" | "es-ES";
  timezone?: string;
};

export type UpdatePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type UpdatePasswordResponse = {
  success: boolean;
};

const USERS_ME_PATH = "/api/v1/users/me";

export function getProfile() {
  return getMe();
}

export function updateProfile(payload: UpdateProfilePayload) {
  return request<AuthUser>(USERS_ME_PATH, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function updateProfilePassword(payload: UpdatePasswordPayload) {
  return request<UpdatePasswordResponse>(`${USERS_ME_PATH}/password`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}
