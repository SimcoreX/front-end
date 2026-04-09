export type { AuthCredentialsPayload as LoginPayload } from "@/lib/types/auth";
export type { AuthSessionResponse as LoginResponse } from "@/lib/types/auth";

export {
  login,
  register,
  getMe,
  refresh,
  logout,
  tryRefreshAuthSession,
} from "@/lib/api/auth";
