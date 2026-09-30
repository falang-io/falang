import type { TSupportAuthorRole } from './support-message.entity.js';

export interface IApiSupportMessage {
  readonly id: string;
  readonly userId: string;
  readonly authorRole: TSupportAuthorRole;
  readonly authorId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface IApiSupportThread {
  readonly userId: string;
  readonly username: string;
  readonly email: string | null;
  readonly lastMessageAt: string;
  readonly lastMessagePreview: string;
  readonly unreadCount: number;
}
