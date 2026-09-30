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
