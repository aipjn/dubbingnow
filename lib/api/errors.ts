import type { ApiErrorCode, ErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public retryable = false,
    public status = 0,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function isErrorBody(value: unknown): value is ErrorBody {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = value.error;
  return (
    !!error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    "code" in error &&
    typeof error.code === "string"
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
