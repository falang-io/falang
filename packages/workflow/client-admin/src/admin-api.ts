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
  readonly email: string | null;
  readonly status: 'pending_email' | 'pending_activation' | 'active';
  readonly companyName: string | null;
  readonly automationInterest: string | null;
  readonly signupSource: 'admin' | 'self-service';
  readonly emailVerifiedAt: string | null;
  readonly activatedAt: string | null;
}

/**
 * `GET /admin/oauth-credentials` row shape — one entry per vendor whose OAuth2 client is the platform's own: native
 * vendors with `oauth2.platformClient` (amoCRM) first, then every ActivePieces OAuth2 piece in the raw catalog.
 * Never carries the secret. See the ADR's "Admin domain".
 */
export interface IAdminOAuthCredential {
  readonly vendor: string;
  readonly source: 'native' | 'activepieces';
  /** The ActivePieces piece name; `null` for a native vendor. */
  readonly pieceName: string | null;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly clientId: string | null;
  readonly updatedAt: string | null;
  /** The callback URL to register in the vendor's app; `null` when the backend has no `BACKEND_PUBLIC_URL`. */
  readonly redirectUri: string | null;
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
  /** How the in-app agent edits documents (ADR 0062 (private)). */
  readonly interface: 'json' | 'nodes';
  readonly updatedAt: string | null;
}

/** `GET`/`PUT /admin/settings/proxy` — the egress-proxy config, never carrying the token (`hasToken` only). ADR 0056 (private). */
export interface IAdminProxySettings {
  readonly configured: boolean;
  readonly url: string | null;
  readonly hasToken: boolean;
  readonly vendors: string[];
  readonly updatedAt: string | null;
}

/** One selectable integration of `GET /admin/settings/proxy/vendors`; a `builtin` label is an i18n key, an `activepieces` one plain text. */
export interface IAdminProxyVendor {
  readonly vendor: string;
  readonly label: string;
  readonly source: 'builtin' | 'activepieces';
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

/** A message of a user's support thread (`/admin/support/threads/:userId/messages`). */
export interface IAdminSupportMessage {
  readonly id: string;
  readonly userId: string;
  readonly authorRole: 'user' | 'admin';
  readonly authorId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** `GET /admin/support/threads` row — `unreadCount` counts the user's messages no admin has read yet. */
export interface IAdminSupportThread {
  readonly userId: string;
  readonly username: string;
  readonly email: string | null;
  readonly lastMessageAt: string;
  readonly lastMessagePreview: string;
  readonly unreadCount: number;
}

/** Thin typed wrappers over `apiRequest` for the `/admin/*` routes — see the ADR's "Admin domain". */
export const adminApi = {
  listUsers: () => apiRequest<IAdminUser[]>('/admin/users'),

  /** `400` when an admin tries to change their own role — surfaced as a rejected promise like any other API error. */
  updateUserRole: (id: string, role: 'user' | 'admin') =>
    apiRequest<IAdminUser>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  /** The plaintext `password` comes back exactly once — the backend keeps only a hash. */
  createUser: (username: string, email = '') =>
    apiRequest<{ id: string; username: string; password: string }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(email ? { username, email } : { username }),
    }),

  getUser: (id: string) => apiRequest<IAdminUser>(`/admin/users/${id}`),

  /** `{ sent: true }` when the login+password mail went out; otherwise `password` comes back once for manual hand-over. */
  activateUser: (id: string) =>
    apiRequest<{ sent: true } | { sent: false; password: string }>(`/admin/users/${id}/activate`, { method: 'POST' }),

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
  upsertAgentSettings: (input: { baseUrl: string; model: string; apiKey?: string; interface?: 'json' | 'nodes' }) =>
    apiRequest<IAdminAgentSettings>('/admin/settings/agent', {
      method: 'PUT',
      body: JSON.stringify(
        input.apiKey ? input : { baseUrl: input.baseUrl, model: input.model, interface: input.interface },
      ),
    }),

  deleteAgentSettings: () => apiRequest<null>('/admin/settings/agent', { method: 'DELETE' }),

  getProxySettings: () => apiRequest<IAdminProxySettings>('/admin/settings/proxy'),

  /** `token` is omitted from the request body entirely when empty, keeping the previously stored token. */
  upsertProxySettings: (input: { url: string; token?: string; vendors: string[] }) =>
    apiRequest<IAdminProxySettings>('/admin/settings/proxy', {
      method: 'PUT',
      body: JSON.stringify(input.token ? input : { url: input.url, vendors: input.vendors }),
    }),

  deleteProxySettings: () => apiRequest<null>('/admin/settings/proxy', { method: 'DELETE' }),

  listProxyVendors: () => apiRequest<{ vendors: IAdminProxyVendor[] }>('/admin/settings/proxy/vendors'),

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

  listSupportThreads: () => apiRequest<IAdminSupportThread[]>('/admin/support/threads'),

  listSupportMessages: (userId: string) =>
    apiRequest<IAdminSupportMessage[]>(`/admin/support/threads/${userId}/messages`),

  replyToSupportThread: (userId: string, text: string) =>
    apiRequest<IAdminSupportMessage>(`/admin/support/threads/${userId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  markSupportThreadRead: (userId: string) =>
    apiRequest<null>(`/admin/support/threads/${userId}/read`, { method: 'POST' }),

  getSupportUnread: () => apiRequest<{ count: number }>('/admin/support/unread'),
};
