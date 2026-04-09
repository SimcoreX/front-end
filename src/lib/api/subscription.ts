import { request } from "@/lib/http/client";
import type {
  CancelSubscriptionPayload,
  CancelSubscriptionResponse,
  GetSubscriptionInvoicesQuery,
  RenewSubscriptionPayload,
  RenewSubscriptionResponse,
  SubscriptionCurrentResponse,
  SubscriptionInvoicesResponse,
} from "@/lib/types/subscription";

const SUBSCRIPTION_BASE_PATH = "/api/v1/subscription";

export function getCurrentSubscription() {
  return request<SubscriptionCurrentResponse>(`${SUBSCRIPTION_BASE_PATH}/current`, {
    method: "GET",
    auth: true,
  });
}

export function getSubscriptionInvoices(query: GetSubscriptionInvoicesQuery = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));

  const path = params.size
    ? `${SUBSCRIPTION_BASE_PATH}/invoices?${params.toString()}`
    : `${SUBSCRIPTION_BASE_PATH}/invoices`;

  return request<SubscriptionInvoicesResponse>(path, {
    method: "GET",
    auth: true,
  });
}

export function renewSubscription(payload?: RenewSubscriptionPayload) {
  return request<RenewSubscriptionResponse>(`${SUBSCRIPTION_BASE_PATH}/renew`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function cancelSubscription(payload?: CancelSubscriptionPayload) {
  return request<CancelSubscriptionResponse>(SUBSCRIPTION_BASE_PATH, {
    method: "DELETE",
    body: payload,
    auth: true,
  });
}
