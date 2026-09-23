/** SQAI failure contract.
 *
 * Engine error codes pass through verbatim (`source: "engine"`); SQAI adds its
 * own codes in the same snake_case vocabulary (`source: "sqai"`). A code is
 * never renamed and the same condition never gets two codes.
 */

export type SqaiErrorSource = "engine" | "sqai";

export interface SqaiErrorOptions {
  retryable?: boolean;
  requestId?: string | null;
  source?: SqaiErrorSource;
  details?: Record<string, unknown>;
}

const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:)?[\\/](?:Users|home|private|tmp|var|etc|opt)[\\/][^\s"']*/g;

/** Defense-in-depth: upstream sanitizes local-source errors, but no message
 * that reaches a model should ever carry an absolute filesystem path. */
export function sanitizeMessage(message: string): string {
  return message.replace(ABSOLUTE_PATH_PATTERN, match => {
    const segments = match.split(/[\\/]/).filter(Boolean);
    return segments.length > 0 ? (segments[segments.length - 1] as string) : "<path>";
  });
}

export class SqaiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly source: SqaiErrorSource;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, options: SqaiErrorOptions = {}) {
    super(sanitizeMessage(message));
    this.name = "SqaiError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId ?? null;
    this.source = options.source ?? "sqai";
    this.details = options.details ?? {};
  }

  toResult(): {
    status: "error";
    code: string;
    message: string;
    retryable: boolean;
    request_id: string | null;
  } {
    return {
      status: "error",
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      request_id: this.requestId,
    };
  }
}

/** SQAI error codes surfaced by the SDK. */
export const SQAI_ERROR_CODES = [
  "unsupported_operation",
  "seed_required",
  "duplicate_argument_binding",
  "policy_denied_source",
  "policy_denied_field",
  "policy_denied_function",
  "source_already_registered",
  "runtime_provision_failed",
  "daemon_port_conflict",
  "unsupported_platform",
  "compute_runtime_unavailable",
  "result_not_found",
  "contract_mismatch",
  "invalid_intent",
] as const;

const RETRYABLE_ENGINE_CODES = new Set([
  "network_error",
  "timeout",
  "rate_limited",
  "service_unavailable",
]);

interface EngineErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

/** Wrap an engine error, preserving its structured code and details. */
export function fromEngineError(error: unknown): SqaiError {
  if (error instanceof SqaiError) {
    return error;
  }
  const errorLike = (error ?? {}) as EngineErrorLike;
  const code = typeof errorLike.code === "string" && errorLike.code ? errorLike.code : "engine_error";
  const message =
    typeof errorLike.message === "string" && errorLike.message
      ? errorLike.message
      : "Engine execution failed.";
  const details =
    errorLike.details && typeof errorLike.details === "object"
      ? (errorLike.details as Record<string, unknown>)
      : {};
  return new SqaiError(code, message, {
    source: "engine",
    retryable: RETRYABLE_ENGINE_CODES.has(code),
    details,
  });
}
