import { tryRefreshAuthSession } from "@/lib/auth/refreshSession";
import { getApiBaseUrl } from "@/lib/http/apiBaseUrl";
import { ApiError } from "@/lib/types/api";
import { useAuthStore } from "@/stores/authStore";

type JsonBody = Record<string, unknown>;

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: JsonBody;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

type ParsedResponse = {
  json: unknown;
  text: string;
};

async function parseResponse(response: Response): Promise<ParsedResponse> {
  const text = await response.text();

  if (!text) {
    return { json: null, text };
  }

  try {
    return {
      json: JSON.parse(text),
      text,
    };
  } catch {
    return {
      json: null,
      text,
    };
  }
}

function buildApiError(
  response: Response,
  parsed: ParsedResponse,
  fallbackPath: string,
  fallbackMethod: string
) {
  const payload =
    parsed.json && typeof parsed.json === "object"
      ? (parsed.json as Record<string, unknown>)
      : null;

  const message =
    (payload?.message as string | string[] | undefined) ??
    response.statusText ??
    "Request failed";

  return new ApiError({
    statusCode: Number(payload?.statusCode ?? response.status),
    message,
    code: String(payload?.code ?? "UNHANDLED_EXCEPTION"),
    path: (payload?.path as string | undefined) ?? fallbackPath,
    method: (payload?.method as string | undefined) ?? fallbackMethod,
  });
}

async function doRequest<TResponse>(path: string, options: RequestOptions): Promise<TResponse> {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  const requiresAuth = options.auth ?? true;
  const apiBaseUrl = getApiBaseUrl();

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (requiresAuth) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const parsed = await parseResponse(response);

  if (response.ok) {
    if (response.status === 204 || parsed.json === null) {
      return {} as TResponse;
    }
    return parsed.json as TResponse;
  }

  const retryOnUnauthorized = options.retryOnUnauthorized ?? true;
  if (response.status === 401 && requiresAuth && retryOnUnauthorized) {
    const refreshed = await tryRefreshAuthSession();
    if (refreshed) {
      return doRequest<TResponse>(path, { ...options, retryOnUnauthorized: false });
    }
  }

  throw buildApiError(response, parsed, path, method);
}

export async function request<TResponse>(
  path: string,
  options: RequestOptions = {}
): Promise<TResponse> {
  return doRequest<TResponse>(path, options);
}
