// oxlint-disable no-undefined -- `undefined` is the honest "this error carries no gRPC code" value here.
import type { Logger } from '@nestjs/common';

export const GRPC_DEADLINE_EXCEEDED = 4;
export const GRPC_NOT_FOUND = 5;
export const GRPC_ALREADY_EXISTS = 6;
export const GRPC_PERMISSION_DENIED = 7;
export const GRPC_UNAVAILABLE = 14;
export const GRPC_UNAUTHENTICATED = 16;

/** The gRPC status code carried by a Temporal client error (directly or anywhere in its `cause` chain), if any. */
export const grpcCodeOf = (error: unknown): number | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'number') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};

export const isPermissionDenied = (error: unknown): boolean => {
  const code = grpcCodeOf(error);
  return code === GRPC_PERMISSION_DENIED || code === GRPC_UNAUTHENTICATED;
};

/**
 * Logs a `PERMISSION_DENIED`/`UNAUTHENTICATED` answer from Temporal loudly (ADR 0057 (private)): the
 * backend's own connection carries an admin token, so a denial means a key/audience mismatch with the
 * stack's authorizer — and, from a runner pod's side, the same code in Temporal's logs means a pod is
 * reaching outside its namespace. Returns whether it was one, so callers can keep their own handling.
 */
export const reportIfPermissionDenied = (logger: Pick<Logger, 'error'>, context: string, error: unknown): boolean => {
  if (!isPermissionDenied(error)) return false;
  logger.error(
    `[security] Temporal denied a request (${context}): ${error instanceof Error ? error.message : String(error)}`,
  );
  return true;
};

/**
 * Answers worth retrying while the stack is coming up: the frontend not reachable yet, or refusing our
 * (valid) token because it hasn't loaded the JWKS yet (it polls the backend for it, so it can lag a
 * restart by one `refreshInterval`).
 */
export const isTransientStartupError = (error: unknown): boolean => {
  const code = grpcCodeOf(error);
  return (
    code === GRPC_UNAVAILABLE ||
    code === GRPC_DEADLINE_EXCEEDED ||
    code === GRPC_PERMISSION_DENIED ||
    code === GRPC_UNAUTHENTICATED ||
    // The SDK's own connect failures carry no gRPC code.
    (code === undefined &&
      error instanceof Error &&
      /failed to connect|deadline|unavailable|ECONNREFUSED/i.test(error.message))
  );
};
