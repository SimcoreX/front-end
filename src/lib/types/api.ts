export type ApiErrorPayload = {
  statusCode: number;
  message: string | string[];
  code: string;
  timestamp?: string;
  path?: string;
  method?: string;
};

export class ApiError extends Error {
  statusCode: number;
  code: string;
  path?: string;
  method?: string;
  details?: string[];

  constructor(payload: ApiErrorPayload) {
    const normalizedMessage = Array.isArray(payload.message)
      ? payload.message.join(" ")
      : payload.message;

    super(normalizedMessage || "Unexpected API error");
    this.name = "ApiError";
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.path = payload.path;
    this.method = payload.method;
    this.details = Array.isArray(payload.message) ? payload.message : undefined;
  }
}

export function isApiError(value: unknown): value is ApiError {
  if (value instanceof ApiError) {
    return true;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ApiError>;
  return (
    typeof candidate.statusCode === "number" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}
