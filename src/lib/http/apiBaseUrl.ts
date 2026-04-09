const DEFAULT_PRODUCTION_API_BASE_URL = "https://simcorex-back-end.onrender.com";

function normalizeApiBaseUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl() {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredApiBaseUrl) {
    return normalizeApiBaseUrl(configuredApiBaseUrl);
  }

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    return "";
  }

  if (process.env.NODE_ENV === "production") {
    return DEFAULT_PRODUCTION_API_BASE_URL;
  }

  return "";
}