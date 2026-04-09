import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMe, login, logout, refresh } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/authStore";

describe("auth api flow", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3000";
    useAuthStore.getState().clearSession();
  });

  it("runs login -> me -> refresh -> logout sequence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-1",
            refreshToken: "refresh-1",
            sessionExpiresAt: "2026-03-24T02:28:50.622Z",
            user: {
              id: "user-1",
              email: "test@example.com",
              name: null,
              role: "student",
              plan: "STANDARD",
              status: "ACTIVE",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            email: "test@example.com",
            name: null,
            role: "student",
            plan: "STANDARD",
            status: "ACTIVE",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-2",
            refreshToken: "refresh-2",
            sessionExpiresAt: "2026-03-24T03:28:50.622Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const loginResponse = await login({ email: "test@example.com", password: "Password123!" });
    expect(loginResponse.accessToken).toBe("access-1");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    const me = await getMe();
    expect(me.email).toBe("test@example.com");

    const refreshed = await refresh({ refreshToken: "refresh-1" });
    expect(refreshed.accessToken).toBe("access-2");

    const logoutResponse = await logout();
    expect(logoutResponse.success).toBe(true);
  });
});
