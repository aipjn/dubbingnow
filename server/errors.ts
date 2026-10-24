import type { ApiErrorCode } from "../lib/api/types";
export class BackendError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
  }
}
export function requireValue(
  condition: unknown,
  code: ApiErrorCode,
  message: string,
  status = 400,
  retryable = false,
): asserts condition {
  if (!condition) throw new BackendError(code, message, status, retryable);
}
