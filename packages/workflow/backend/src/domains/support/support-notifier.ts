import type { IApiSupportMessage } from './support.types.js';

/**
 * Notification seam for the support chat. The community default does nothing (`NoopSupportNotifier`); an
 * edition that e-mails admins/users provides its own `SUPPORT_NOTIFIER` (same pattern as `AGENT_USAGE_SINK`:
 * `SupportService` injects it `@Optional()`).
 */
export interface ISupportNotifier {
  notifyAdminsOfUserMessage: (userId: string, message: IApiSupportMessage) => Promise<void>;
  notifyUserOfAdminReply: (userId: string, message: IApiSupportMessage) => Promise<void>;
}

export const SUPPORT_NOTIFIER = Symbol('SUPPORT_NOTIFIER');

export class NoopSupportNotifier implements ISupportNotifier {
  notifyAdminsOfUserMessage(): Promise<void> {
    return Promise.resolve();
  }

  notifyUserOfAdminReply(): Promise<void> {
    return Promise.resolve();
  }
}
