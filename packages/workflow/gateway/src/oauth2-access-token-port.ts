/**
 * DI token for `IOAuth2AccessTokenPort` — same shape as `FILE_UPLOAD_PORT` (see `file-upload-port.ts`). Register with
 * `{ provide: OAUTH2_ACCESS_TOKEN_PORT, useExisting: … }`, thread it into `GatewayModule.forRootAsync` via
 * `resolveOAuth2AccessTokenPort`.
 */
export const OAUTH2_ACCESS_TOKEN_PORT = Symbol('OAUTH2_ACCESS_TOKEN_PORT');

/**
 * Backs `IIntegrationBackendContext.getOAuth2AccessToken` (`@falang/workflow-integrations-common`): the host resolves
 * — and, when due, refreshes and persists — a project's OAuth2 credential with the platform client secret that never
 * leaves it. Implemented in `backend` by the same service as `POST /internal/credentials/oauth2-access-token`.
 */
export interface IOAuth2AccessTokenPort {
  getAccessToken(projectId: string, vendor: string, credentialId: string): Promise<string>;
}
