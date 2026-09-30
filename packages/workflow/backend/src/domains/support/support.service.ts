import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, type FindOptionsWhere, type Repository } from 'typeorm';
import { UsersService } from '../users/users/users.service.js';
import { NoopSupportNotifier, SUPPORT_NOTIFIER, type ISupportNotifier } from './support-notifier.js';
import { SupportMessage, type TSupportAuthorRole } from './support-message.entity.js';
import type { IApiSupportMessage, IApiSupportThread } from './support.types.js';

const MAX_TEXT_LENGTH = 4000;
const PREVIEW_LENGTH = 120;

const toApi = (m: SupportMessage): IApiSupportMessage => ({
  id: m.id,
  userId: m.userId,
  authorRole: m.authorRole,
  authorId: m.authorId,
  text: m.text,
  createdAt: new Date(m.createdAt).toISOString(),
  readAt: m.readAt ? new Date(m.readAt).toISOString() : null,
});

/** The user ↔ administrator support chat; one thread per user (the thread is identified by `userId`). */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly messages: Repository<SupportMessage>;
  private readonly users: UsersService;
  private readonly notifier: ISupportNotifier;

  constructor(
    @InjectRepository(SupportMessage) messages: Repository<SupportMessage>,
    @Inject(UsersService) users: UsersService,
    @Optional() @Inject(SUPPORT_NOTIFIER) notifier?: ISupportNotifier,
  ) {
    this.messages = messages;
    this.users = users;
    this.notifier = notifier ?? new NoopSupportNotifier();
  }

  async listMessages(userId: string, after?: string): Promise<IApiSupportMessage[]> {
    const where: FindOptionsWhere<SupportMessage> = { userId };
    if (typeof after === 'string') where.createdAt = MoreThan(new Date(after));
    const rows = await this.messages.find({ where, order: { createdAt: 'ASC' } });
    return rows.map((row) => toApi(row));
  }

  async send(
    userId: string,
    authorRole: TSupportAuthorRole,
    authorId: string,
    text: string,
  ): Promise<IApiSupportMessage> {
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new BadRequestException('Message text must not be empty');
    if (trimmed.length > MAX_TEXT_LENGTH)
      throw new BadRequestException(`Message text is limited to ${MAX_TEXT_LENGTH} characters`);
    const saved = await this.messages.save(
      this.messages.create({ userId, authorRole, authorId, text: trimmed, createdAt: new Date(), readAt: null }),
    );
    const api = toApi(saved);
    try {
      await (authorRole === 'user'
        ? this.notifier.notifyAdminsOfUserMessage(userId, api)
        : this.notifier.notifyUserOfAdminReply(userId, api));
    } catch (error) {
      this.logger.warn(`Support notifier failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return api;
  }

  /** Marks messages written by `authorRole` in the thread as read (the reader is the opposite side). */
  async markRead(userId: string, authorRole: TSupportAuthorRole): Promise<void> {
    await this.messages.update({ userId, authorRole, readAt: IsNull() }, { readAt: new Date() });
  }

  countUnreadForUser(userId: string): Promise<number> {
    return this.messages.count({ where: { userId, authorRole: 'admin', readAt: IsNull() } });
  }

  countUnreadForAdmins(): Promise<number> {
    return this.messages.count({ where: { authorRole: 'user', readAt: IsNull() } });
  }

  async listThreads(): Promise<IApiSupportThread[]> {
    const grouped = await this.messages
      .createQueryBuilder('m')
      .select('m.userId', 'userId')
      .addSelect(`SUM(CASE WHEN m.authorRole = 'user' AND m.readAt IS NULL THEN 1 ELSE 0 END)`, 'unread')
      .groupBy('m.userId')
      .getRawMany<{ userId: string; unread: string | number | null }>();
    if (grouped.length === 0) return [];
    const allUsers = await this.users.findAll();
    const usernames = new Map(allUsers.map((u) => [u.id, u.username]));
    const threads = await Promise.all(
      grouped.map(async (row): Promise<IApiSupportThread | null> => {
        const last = await this.messages.findOne({ where: { userId: row.userId }, order: { createdAt: 'DESC' } });
        if (!last) return null;
        return {
          userId: row.userId,
          username: usernames.get(row.userId) ?? row.userId,
          // TODO(P2): the `User` entity gains an `email` column on another branch; return it here then.
          email: null,
          lastMessageAt: new Date(last.createdAt).toISOString(),
          lastMessagePreview: last.text.slice(0, PREVIEW_LENGTH),
          unreadCount: Number(row.unread ?? 0),
        };
      }),
    );
    return threads
      .filter((t): t is IApiSupportThread => t !== null)
      .toSorted((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }
}
