/**
 * backend/middleware/error_handler.ts
 * Centralised error handler. Converts ZodError instances into structured
 * JSON payloads and distinguishes validation errors (400) from internal
 * errors (500). Register this after all route handlers.
 */

import { ZodError, ZodIssue } from "zod";

export interface ErrorDetail {
  field: string;
  message: string;
  code: string;
}

export interface ErrorResponse {
  status: number;
  type: string;
  details: ErrorDetail[];
}

function mapZodIssues(issues: ZodIssue[]): ErrorDetail[] {
  return issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "root",
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Converts any caught error into a structured ErrorResponse.
 * Stack traces are never included in the returned payload.
 */
export function handleError(err: unknown): ErrorResponse {
  if (err instanceof ZodError) {
    return {
      status: 400,
      type: "ValidationError",
      details: mapZodIssues(err.issues),
    };
  }

  return {
    status: 500,
    type: "InternalServerError",
    details: [
      {
        field: "unknown",
        message: "An unexpected error occurred",
        code: "internal_error",
      },
    ],
  };
}
