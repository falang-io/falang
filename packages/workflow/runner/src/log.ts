// oxlint-disable no-console
/** Log format of the runner process (ADR 0060 (private)): `LOG_FORMAT=json` = one JSON object per line on stderr, anything else = the previous text output. */
export const isJsonLogFormat = (env: NodeJS.ProcessEnv = process.env): boolean => env.LOG_FORMAT === 'json';

const jsonSafe = (_key: string, value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
};

/** `{"time","level","message",...meta}` — `meta` never overrides the three fixed keys. */
export const formatJsonLogLine = (
  level: string,
  message: string,
  meta?: Record<string, unknown>,
  time = new Date(),
): string => JSON.stringify({ ...meta, time: time.toISOString(), level: level.toLowerCase(), message }, jsonSafe);

const writeLine = (level: 'error' | 'info', message: string, error: unknown = null): void => {
  if (isJsonLogFormat()) {
    const meta = error === null ? null : { error };
    process.stderr.write(`${formatJsonLogLine(level, message, meta ?? {})}\n`);
    return;
  }
  if (level === 'error') console.error(message, ...(error === null ? [] : [error]));
  else console.log(message);
};

/** The runner's own (non-SDK) log lines. */
export const log = {
  info: (message: string): void => writeLine('info', message),
  error: (message: string, error?: unknown): void => writeLine('error', message, error),
};
