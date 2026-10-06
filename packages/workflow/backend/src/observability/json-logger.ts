import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context.js';

const LEVELS_ASCENDING: readonly LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

/**
 * `LOG_LEVEL`: a comma-separated list of levels (`warn,error`) or one level meaning "this and above"
 * (`warn` = warn, error, fatal). Unknown names are ignored; nothing valid → `null` (Nest's default).
 */
export const parseLogLevels = (raw: string | null): LogLevel[] | null => {
  const tokens = (raw ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token): token is LogLevel => (LEVELS_ASCENDING as readonly string[]).includes(token));
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return LEVELS_ASCENDING.slice(LEVELS_ASCENDING.indexOf(tokens[0] as LogLevel));
  return tokens;
};

/** One JSON object per line, enriched with the current request's id (when inside a request). */
export class RequestAwareJsonLogger extends ConsoleLogger {
  protected override getJsonLogObject(
    message: unknown,
    options: { context: string; logLevel: LogLevel; writeStreamType?: 'stdout' | 'stderr'; errorStack?: unknown },
  ): ReturnType<ConsoleLogger['getJsonLogObject']> & { requestId?: string } {
    const logObject: ReturnType<ConsoleLogger['getJsonLogObject']> & { requestId?: string } = super.getJsonLogObject(
      message,
      options,
    );
    const requestId = getRequestId();
    if (requestId) logObject.requestId = requestId;
    return logObject;
  }
}

/** The app logger from env: `LOG_FORMAT=json` selects `RequestAwareJsonLogger`; `LOG_LEVEL` optionally filters. `null` = Nest's own default. */
export const createAppLogger = (env: NodeJS.ProcessEnv = process.env): ConsoleLogger | null => {
  const logLevels = parseLogLevels(env.LOG_LEVEL ?? null);
  if (env.LOG_FORMAT?.trim().toLowerCase() === 'json') {
    return new RequestAwareJsonLogger({
      json: true,
      colors: false,
      compact: true,
      ...(logLevels ? { logLevels } : {}),
    });
  }
  return logLevels ? new ConsoleLogger({ logLevels }) : null;
};
