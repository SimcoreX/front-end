const DEFAULT_PRODUCTION_API_BASE_URL = "https://simcorex-back-end.onrender.com";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function normalizeApiBaseUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl() {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredApiBaseUrl) {
    return normalizeApiBaseUrl(configuredApiBaseUrl);
  }

  if (typeof window !== "undefined" && LOCAL_HOSTNAMES.has(window.location.hostname)) {
    return "";
  }

  return DEFAULT_PRODUCTION_API_BASE_URL;
}