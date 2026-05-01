import { request } from "@/lib/http/client";
import { isApiError } from "@/lib/types/api";
import type {
  CreateJournalPayload,
  DayJournal,
  DeleteJournalResponse,
  GetDayJournalResponse,
  ListJournalsQuery,
  PaginatedJournalsApiResponse,
  PaginatedJournalsResponse,
  UpdateJournalPayload,
} from "@/lib/types/journals";
import { useAuthStore } from "@/stores/authStore";

const JOURNALS_BASE_PATH = "/api/v1/journals";
const JOURNAL_ACCOUNT_NOT_READY_ERROR = "JOURNAL_ACCOUNT_NOT_READY";

export async function listJournals(query: ListJournalsQuery = {}): Promise<PaginatedJournalsResponse> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 10));
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("limit", String(limit));
  params.set("sortBy", query.sortBy ?? "tradingDay");
  params.set("sortOrder", query.sortOrder ?? "desc");
  params.set("timezone", query.timezone ?? "UTC");

  if (query.scope) {
    params.set("scope", query.scope);
  }

  const path = `${JOURNALS_BASE_PATH}?${params.toString()}`;

  try {
    const response = await request<PaginatedJournalsApiResponse>(path, {
      method: "GET",
      auth: true,
    });

    const resolvedPage = response.page ?? page;
    const resolvedLimit = response.limit ?? limit;
    const total = Number(response.total ?? 0);
    const hasNextPage =
      response.hasNextPage ?? resolvedPage * resolvedLimit < total;

    return {
      data: (response.data ?? []).map(normalizeDayJournal),
      page: resolvedPage,
      limit: resolvedLimit,
      total,
      hasNextPage,
    };
  } catch (error) {
    logInvalidUuidPayloadIfNeeded(error, {
      operation: "listJournals",
      query: {
        ...query,
        page,
        limit,
      },
    });
    throw error;
  }
}

export async function getDayJournal(date: string): Promise<GetDayJournalResponse> {
  const normalizedAccountId = resolveJournalAccountId();

  const params = new URLSearchParams();
  params.set("date", date);
  params.set("accountId", normalizedAccountId);

  try {
    const response = await request<GetDayJournalResponse>(`${JOURNALS_BASE_PATH}/day?${params.toString()}`, {
      method: "GET",
      auth: true,
    });

    return {
      data: response?.data ? normalizeDayJournal(response.data) : null,
    };
  } catch (error) {
    logInvalidUuidPayloadIfNeeded(error, {
      operation: "getDayJournal",
      date,
      accountId: normalizedAccountId,
    });
    throw error;
  }
}

export async function createJournal(payload: CreateJournalPayload): Promise<GetDayJournalResponse> {
  const normalizedAccountId = resolveJournalAccountId();

  const requestBody = {
    ...payload,
    accountId: normalizedAccountId,
    title: payload.title ?? null,
    metadata: payload.metadata ?? null,
  };

  try {
    const response = await request<{ data?: DayJournal }>(JOURNALS_BASE_PATH, {
      method: "POST",
      body: requestBody,
      auth: true,
    });

    return {
      data: response?.data ? normalizeDayJournal(response.data) : null,
    };
  } catch (error) {
    logInvalidUuidPayloadIfNeeded(error, {
      operation: "createJournal",
      body: requestBody,
    });
    throw error;
  }
}

export async function updateJournal(
  id: string,
  payload: UpdateJournalPayload
): Promise<GetDayJournalResponse> {
  const response = await request<{ data?: DayJournal }>(`${JOURNALS_BASE_PATH}/${id}`, {
    method: "PATCH",
    body: {
      ...payload,
      title: payload.title ?? undefined,
      metadata: payload.metadata ?? undefined,
    },
    auth: true,
  });

  return {
    data: response?.data ? normalizeDayJournal(response.data) : null,
  };
}

export function deleteJournal(id: string) {
  return request<DeleteJournalResponse>(`${JOURNALS_BASE_PATH}/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

function normalizeDayJournal(journal: DayJournal): DayJournal {
  return {
    id: String(journal.id),
    tradingDay: String(journal.tradingDay),
    timezone: String(journal.timezone),
    scope: journal.scope,
    title: typeof journal.title === "string" ? journal.title : null,
    content: typeof journal.content === "string" ? journal.content : "",
    metadata:
      journal.metadata && typeof journal.metadata === "object"
        ? (journal.metadata as Record<string, unknown>)
        : null,
    updatedAt: String(journal.updatedAt),
    createdAt: typeof journal.createdAt === "string" ? journal.createdAt : undefined,
  };
}

function normalizeCanonicalUuid(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function resolveJournalAccountId() {
  const accountId = useAuthStore.getState().user?.accountId;
  const normalized = normalizeCanonicalUuid(accountId);

  if (!normalized) {
    throw new Error(JOURNAL_ACCOUNT_NOT_READY_ERROR);
  }

  return normalized;
}

function logInvalidUuidPayloadIfNeeded(error: unknown, payload: Record<string, unknown>) {
  if (!isApiError(error)) return;
  if (error.statusCode !== 400) return;
  if (!/accountId must be a UUID/i.test(error.message)) return;

  console.error("[journal] backend rejected accountId payload", payload);
}

export { JOURNAL_ACCOUNT_NOT_READY_ERROR };
