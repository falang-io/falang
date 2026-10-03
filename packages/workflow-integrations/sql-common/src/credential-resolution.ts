import { parseSqlConnectionString } from './connection-string.js';

/**
 * Resolves one SQL credential field (`connectionString`/`ssl`) to its real, decrypted value via
 * `@falang/workflow-backend`'s internal credential-resolve endpoint — same trust boundary/mechanism
 * as `openai.integration.ts`'s `resolveOpenAiField`.
 *
 * A real, package-level export (not text generated per dialect) so every SQL dialect's
 * `sharedActivityCode` imports it with one identical `import …` line instead of each redeclaring its
 * own copy of this logic under the same local name — `compileActivities`
 * (`@falang/workflow-compiler`) only dedupes textually-identical import statements, so three
 * per-dialect copies of a *bare* `const resolveConnectionString = …` collided once every registered
 * vendor's shared activity code was concatenated into one module (found live via
 * `compile-project-documents.test.ts`'s "every REGISTERED_INTEGRATIONS at once" regression test —
 * see ADR 0039 (private)). Safe to import at this package's own top level
 * (unlike the `pg`/`mysql2`/`node:sqlite` drivers, which stay lazy `await import(...)`s inside
 * generated strings/backend hooks only) since it only touches `fetch`/`process.env`, both harmless in
 * the browser bundle this package also ships into (the workflow editor).
 *
 * `defaultValue`: a `select`-kind credential field like `ssl` that the user never touched resolves to
 * `''` (see `IntegrationsEditor`'s form scaffolding), and the internal resolve endpoint 404s on any
 * falsy resolved value regardless of field kind (`InternalCredentialsController`'s `if (!value)`
 * check) — so an unset `ssl` field would otherwise break every connection. Passing a `defaultValue`
 * makes a failed resolve (404 or otherwise) fall back to it instead of throwing; omit it (as
 * `connectionString` does) to keep failing loudly when the field is genuinely required.
 */
export const resolveSqlCredentialField = async (
  credentialId: string,
  vendor: string,
  field: string,
  defaultValue?: string,
): Promise<string> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;
  const projectId = process.env.PROJECT_ID;
  if (!backendUrl || !internalProjectToken || !projectId) {
    throw new Error(
      'BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process',
    );
  }
  const env = process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev';
  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },
    body: JSON.stringify({ credentialId, vendor, field, projectId, env }),
  });
  if (!response.ok) {
    // oxlint-disable-next-line no-undefined -- distinguishing "no default given" from an actual empty-string default.
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Failed to resolve SQL credential ${credentialId}: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { value: string };
  // Same allow-list the backend applies: a pod never connects with a socket path / file-reading parameter either.
  if (field === 'connectionString' && (vendor === 'postgres' || vendor === 'mysql')) {
    parseSqlConnectionString(vendor, data.value);
  }
  return data.value;
};
