/**
 * Resolves a `credentialId` to its real secret value by calling `@falang/workflow-backend`'s
 * existing internal resolver (`POST /internal/credentials/resolve`, guarded by `ProjectTokenGuard` —
 * see `packages/workflow/backend/src/domains/integrations/internal-credentials.controller.ts`).
 * Secrets never transit `runner` or any compiled activity code — only this service and `backend`
 * ever see the plaintext value. See ADR 0010 (private).
 *
 * `projectId`/`internalProjectToken` are per-project (see
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth") —
 * this service never mints or stores them itself, it only forwards whatever the caller (a runner
 * pod's `runActivepiecesAction` activity, or `backend`'s own polling loop) already holds.
 */
export const resolveCredential = async (
  credentialId: string,
  vendor: string,
  field: string,
  projectId: string,
  internalProjectToken: string,
  env: 'dev' | 'prod' = 'dev',
): Promise<string> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  if (!backendUrl) throw new Error('BACKEND_INTERNAL_URL is not configured');
  if (!internalProjectToken) throw new Error('internalProjectToken is required to resolve a credential');

  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-project-token': internalProjectToken },
    body: JSON.stringify({ credentialId, vendor, field, projectId, env }),
  });
  if (response.status === 404) throw new NotFoundError(await response.text());
  if (!response.ok)
    throw new Error(`Credential resolve failed with status ${response.status}: ${await response.text()}`);

  const body = (await response.json()) as { value: string };
  return body.value;
};

export class NotFoundError extends Error {}
