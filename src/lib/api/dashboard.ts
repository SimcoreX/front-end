import { request } from "@/lib/http/client";
import type { DashboardOverviewQuery, DashboardOverviewResponse } from "@/lib/types/dashboard";

const DASHBOARD_OVERVIEW_PATH = "/api/v1/dashboard/overview";

export function getDashboardOverview(query: DashboardOverviewQuery = {}) {
  const params = new URLSearchParams();

  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.timezone) params.set("timezone", query.timezone);

  const path = params.size
    ? `${DASHBOARD_OVERVIEW_PATH}?${params.toString()}`
    : DASHBOARD_OVERVIEW_PATH;

  return request<DashboardOverviewResponse>(path, {
    method: "GET",
    auth: true,
  });
}
