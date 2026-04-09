import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/types/api";
import { useAuthStore } from "@/stores/authStore";

vi.mock("@/lib/auth/refreshSession", () => ({
  tryRefreshAuthSession: vi.fn(),
}));

import { tryRefreshAuthSession } from "@/lib/auth/refreshSession";
import { request } from "./client";

describe("http client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:3000";
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: "token-1",
      refreshToken: "refresh-1",
    });
  });

  it("throws ApiError with backend payload fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 400,
            message: ["email must be an email"],
            code: "UNHANDLED_EXCEPTION",
            path: "/api/v1/auth/login",
            method: "POST",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(request("/api/v1/auth/login", { method: "POST", auth: false })).rejects.toBeInstanceOf(
      ApiError
    );
  });

  it("retries once after refresh on unauthorized", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 401,
            message: "Unauthorized",
            code: "UNHANDLED_EXCEPTION",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(tryRefreshAuthSession).mockResolvedValue(true);

    const response = await request<{ ok: boolean }>("/api/v1/protected", { method: "GET" });

    expect(response.ok).toBe(true);
    expect(tryRefreshAuthSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
