/**
 * Startup validation of the deployment's secrets. In production (`NODE_ENV=production`) the backend
 * refuses to start with a missing, well-known (dev/e2e/placeholder) or too-short secret; elsewhere it
 * only warns, so local dev and tests keep their old behavior.
 */
export const MIN_SECRET_LENGTH = 32;
export const DEV_JWT_SECRET = 'dev-secret-change-me';
export const DEV_PROJECT_TOKEN_SECRET = 'dev-project-token-secret-change-me';

// oxlint-disable-next-line no-console
const defaultWarn = (message: string): void => console.warn(message);

type TEnv = Record<string, string | undefined>;

export interface ISecretsValidationResult {
  /** Problems found, each naming the offending variable. Empty when everything is fine. */
  problems: string[];
}

const SECRET_NAMES = ['JWT_SECRET', 'DB_PASSWORD', 'CREDENTIALS_ENCRYPTION_KEY', 'PROJECT_TOKEN_SECRET'] as const;

const WEAK_PATTERNS: RegExp[] = [
  /^dev[-_]/i,
  /^e2e[-_]/i,
  /change[-_]?me/i,
  /^changeit$/i,
  /^(admin|secret|password|falang|temporal|test|default|example|postgres|root)$/i,
];

const isWeakKnownValue = (value: string): boolean => WEAK_PATTERNS.some((pattern) => pattern.test(value.trim()));

/** Pure check: which of the secrets are unacceptable for a production deployment. */
export const findSecretProblems = (env: TEnv): ISecretsValidationResult => {
  const problems: string[] = [];
  for (const name of SECRET_NAMES) {
    const value = env[name];
    if (!value || value.trim() === '') {
      problems.push(`${name} is not set`);
    } else if (isWeakKnownValue(value)) {
      problems.push(`${name} is a known development/placeholder value`);
    } else if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
    }
  }
  return { problems };
};

/**
 * Throws in production when any secret is unacceptable; otherwise logs one warning per problem via
 * `warn` (default `console.warn`) and returns.
 */
export const validateSecrets = (env: TEnv = process.env, warn: (message: string) => void = defaultWarn): void => {
  const { problems } = findSecretProblems(env);
  if (problems.length === 0) return;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      `Refusing to start in production with insecure configuration: ${problems.join('; ')}. ` +
        `Set strong random values (>= ${MIN_SECRET_LENGTH} characters, e.g. \`openssl rand -hex 32\`).`,
    );
  }
  for (const problem of problems) warn(`[security] ${problem} (tolerated outside NODE_ENV=production)`);
};

/** The one place JWT_SECRET is read (module signer and passport strategy). No silent default in production. */
export const resolveJwtSecret = (value: string | undefined, nodeEnv: string | undefined): string => {
  if (value) return value;
  if (nodeEnv === 'production') throw new Error('JWT_SECRET is not set');
  return DEV_JWT_SECRET;
};

/**
 * The one place `PROJECT_TOKEN_SECRET` (the HMAC key every per-project internal token is derived from,
 * ADR 0057 (private)) is read. No silent default in production; elsewhere a well-known dev value
 * (`validateSecrets` warns about the missing variable at boot).
 */
export const resolveProjectTokenSecret = (value: string | undefined, nodeEnv: string | undefined): string => {
  if (value) return value;
  if (nodeEnv === 'production') throw new Error('PROJECT_TOKEN_SECRET is not set');
  return DEV_PROJECT_TOKEN_SECRET;
};
