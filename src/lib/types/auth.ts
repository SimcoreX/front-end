export type AuthUserRole = "student" | "mentor" | "admin" | string;

export type AuthUserPlan = "STANDARD" | "PRO" | "ENTERPRISE" | string;

export type AuthAccountType = "student" | "admin" | "user" | string;

export type AuthUserStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | string;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatar?: string | null;
  language?: "pt-BR" | "en-US" | "es-ES" | string;
  timezone?: string;
  role: AuthUserRole;
  plan?: AuthUserPlan;
  status: AuthUserStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthCredentialsPayload = {
  email: string;
  password: string;
  accountType?: AuthAccountType;
};

export type RefreshTokenPayload = {
  refreshToken?: string;
};

export type AuthSessionResponse = {
  accessToken: string;
  refreshToken?: string;
  sessionExpiresAt: string;
  user?: AuthUser;
};

export type LogoutResponse = {
  success: boolean;
};
