import { apiRequest } from '@falang/workflow-client-common';

/**
 * `GET /admin/users` row shape — see
 * ADR 0030 (private), "Admin domain".
 */
export interface IAdminUser {
  readonly id: string;
  readonly username: string;
  readonly role: 'user' | 'admin';
  readonly language: string;
  readonly createdAt: string;
  readonly projectsCount: number;
}

/**
 * `GET /admin/oauth-credentials` row shape — one entry per ActivePieces OAuth2 piece in the raw
 * catalog, never carrying the secret. See the ADR's "Admin domain".
 */
export interface IAdminOAuthCredential {
  readonly vendor: string;
  readonly pieceName: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly clientId: string | null;
  readonly updatedAt: string | null;
}

/**
 * `GET /admin/settings/agent` row shape — the app-wide agent configuration, never carrying the
 * key itself (`hasApiKey` only). See ADR 0031 (private).
 */
export interface IAdminAgentSettings {
  readonly configured: boolean;
  readonly baseUrl: string | null;
  readonly model: string | null;
  readonly hasApiKey: boolean;
  readonly updatedAt: string | null;
}

/** `GET /admin/project-templates` row — see `ProjectTemplatesService`. */
export interface IAdminProjectTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly sourceProjectId: string | null;
  readonly createdBy: string | null;
  readonly updatedAt: string;
}

/**
 * `GET`/`PUT /admin/users/:id/limits` row shape — per-user file/quota overrides. See
 * ADR 0038 (private) §2.
 */
export interface IUserLimits {
  readonly maxProjectFilesBytes: number;
  readonly maxFileBytes: number;
  readonly devFileTtlHours: number;
  readonly ingressFileTtlHours: number;
  readonly maxConcurrentProdVersions: number;
}

/** A field set to `null` clears that override (falls back to the env default); an omitted field leaves it untouched. */
export type IUserLimitsOverrides = Partial<Record<keyof IUserLimits, number | null>>;

export interface IUserLimitsResponse {
  readonly effective: IUserLimits;
  readonly overrides: Partial<IUserLimits>;
}

/** Thin typed wrappers over `apiRequest` for the `/admin/*` routes — see the ADR's "Admin domain". */
export const adminApi = {
  listUsers: () => apiRequest<IAdminUser[]>('/admin/users'),

  /** `400` when an admin tries to change their own role — surfaced as a rejected promise like any other API error. */
  updateUserRole: (id: string, role: 'user' | 'admin') =>
    apiRequest<IAdminUser>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  /** The plaintext `password` comes back exactly once — the backend keeps only a hash. */
  createUser: (username: string) =>
    apiRequest<{ id: string; username: string; password: string }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  resetUserPassword: (id: string) =>
    apiRequest<{ password: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),

  listOAuthCredentials: () => apiRequest<IAdminOAuthCredential[]>('/admin/oauth-credentials'),

  upsertOAuthCredential: (vendor: string, input: { clientId: string; clientSecret: string }) =>
    apiRequest<IAdminOAuthCredential>(`/admin/oauth-credentials/${vendor}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteOAuthCredential: (vendor: string) =>
    apiRequest<null>(`/admin/oauth-credentials/${vendor}`, { method: 'DELETE' }),

  getAgentSettings: () => apiRequest<IAdminAgentSettings>('/admin/settings/agent'),

  /** `apiKey` is omitted from the request body entirely when empty, keeping the previously stored key. */
  upsertAgentSettings: (input: { baseUrl: string; model: string; apiKey?: string }) =>
    apiRequest<IAdminAgentSettings>('/admin/settings/agent', {
      method: 'PUT',
      body: JSON.stringify(input.apiKey ? input : { baseUrl: input.baseUrl, model: input.model }),
    }),

  deleteAgentSettings: () => apiRequest<null>('/admin/settings/agent', { method: 'DELETE' }),

  listProjectTemplates: () => apiRequest<IAdminProjectTemplate[]>('/admin/project-templates'),

  createProjectTemplate: (input: { name: string; description: string; sourceProjectId: string }) =>
    apiRequest<IAdminProjectTemplate>('/admin/project-templates', { method: 'POST', body: JSON.stringify(input) }),

  updateProjectTemplate: (
    id: string,
    patch: { name?: string; description?: string; enabled?: boolean; sortOrder?: number },
  ) =>
    apiRequest<IAdminProjectTemplate>(`/admin/project-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  refreshProjectTemplate: (id: string, sourceProjectId: string) =>
    apiRequest<IAdminProjectTemplate>(`/admin/project-templates/${id}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ sourceProjectId }),
    }),

  /** `payload` is a project export (`GET /projects/:id/export` shape). */
  uploadProjectTemplatePayload: (id: string, payload: unknown) =>
    apiRequest<IAdminProjectTemplate>(`/admin/project-templates/${id}/payload`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  exportProjectTemplate: (id: string) => apiRequest<unknown>(`/admin/project-templates/${id}/export`),

  deleteProjectTemplate: (id: string) => apiRequest<null>(`/admin/project-templates/${id}`, { method: 'DELETE' }),

  getUserLimits: (id: string) => apiRequest<IUserLimitsResponse>(`/admin/users/${id}/limits`),

  updateUserLimits: (id: string, overrides: IUserLimitsOverrides) =>
    apiRequest<IUserLimitsResponse>(`/admin/users/${id}/limits`, {
      method: 'PUT',
      body: JSON.stringify(overrides),
    }),
};
