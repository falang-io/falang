/**
 * Validation/parsing of a tenant-supplied SQL `connectionString` — pure (WHATWG `URL` only, no `node:*`),
 * since this package is also barrel-exported into the browser bundle.
 *
 * Why it exists: `pg`/`mysql2` accept far more than "host, port, user, password, database" in a URI —
 * `pg` maps *every* query parameter onto its config (`host=/var/run/...` = unix socket,
 * `sslrootcert`/`sslcert`/`sslkey`/`sslcrl` = read a file from this machine, `passfile`, `service`…), and
 * `mysql2` the same (`socketPath`, `flags` incl. `LOCAL_FILES`, `infileStreamFactory`…). A connection
 * string is data a tenant controls, so only a short allowlist of query parameters is accepted, the URL
 * must name a real TCP host, and the host/port/credentials are handed to the driver as separate fields
 * (never as a re-parsed string).
 */
export class SqlConnectionStringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlConnectionStringError';
  }
}

export interface IParsedSqlConnectionString {
  readonly host: string;
  /** `null` when the string names no port (the driver default applies). */
  readonly port: number | null;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

const ALLOWED_QUERY_PARAMS: Readonly<Record<'postgres' | 'mysql', ReadonlySet<string>>> = {
  postgres: new Set([
    'sslmode',
    'application_name',
    'connect_timeout',
    'statement_timeout',
    'query_timeout',
    'options',
    'keepalives',
    'target_session_attrs',
  ]),
  mysql: new Set(['charset', 'timezone', 'connecttimeout', 'connect_timeout', 'ssl-mode', 'sslmode']),
};

const ALLOWED_SCHEMES: Readonly<Record<'postgres' | 'mysql', readonly string[]>> = {
  postgres: ['postgres:', 'postgresql:'],
  mysql: ['mysql:', 'mysql2:'],
};

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
};

/** Throws `SqlConnectionStringError` unless `connectionString` is a plain TCP URI for `dialect` with only allow-listed parameters. */
export const parseSqlConnectionString = (
  dialect: 'postgres' | 'mysql',
  connectionString: string,
): IParsedSqlConnectionString => {
  const url = parseUrl(connectionString);
  if (!url) {
    throw new SqlConnectionStringError(
      `Connection string must be a URL like ${dialect}://user:password@host:port/database`,
    );
  }
  if (!ALLOWED_SCHEMES[dialect].includes(url.protocol)) {
    throw new SqlConnectionStringError(`Connection string must start with ${ALLOWED_SCHEMES[dialect][0]}//`);
  }
  const host = decodeURIComponent(url.hostname);
  if (!host || host.startsWith('/') || host.includes('\\') || host.includes('/')) {
    throw new SqlConnectionStringError('Connection string must name a TCP host (unix sockets are not allowed)');
  }
  for (const [key] of url.searchParams) {
    if (!ALLOWED_QUERY_PARAMS[dialect].has(key.toLowerCase())) {
      throw new SqlConnectionStringError(`Connection string parameter "${key}" is not allowed`);
    }
  }
  return {
    host: host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host,
    port: url.port ? Number(url.port) : null,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
};

/** `true` for an IPv4/IPv6 literal (used to decide whether a TLS `servername` is meaningful) — no `node:net`. */
export const isIpLiteral = (host: string): boolean => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
