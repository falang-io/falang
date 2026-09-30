import { makeObservable, observable, runInAction } from 'mobx';
import { adminApi, type IAdminSupportMessage, type IAdminSupportThread } from './admin-api.js';

const POLL_MS = 15_000;

const errorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/**
 * The administrator side of the support chat. Two polls, both 15s: the total unread count (started by the admin
 * shell for as long as it is mounted, drives the menu badge) and — while the Support page is mounted — the thread
 * list plus the selected conversation.
 */
export class AdminSupportStore {
  @observable unreadTotal = 0;
  @observable threads: IAdminSupportThread[] = [];
  @observable selectedUserId: string | null = null;
  @observable messages: IAdminSupportMessage[] = [];
  @observable sending = false;
  @observable error: string | null = null;

  private unreadTimer: ReturnType<typeof setTimeout> | null = null;
  private unreadActive = false;
  private pageTimer: ReturnType<typeof setTimeout> | null = null;
  private pageActive = false;

  constructor() {
    makeObservable(this);
  }

  startUnreadPolling(): void {
    if (this.unreadActive) return;
    this.unreadActive = true;
    this.pollUnread();
  }

  stopUnreadPolling(): void {
    this.unreadActive = false;
    if (this.unreadTimer) clearTimeout(this.unreadTimer);
    this.unreadTimer = null;
  }

  startPagePolling(): void {
    if (this.pageActive) return;
    this.pageActive = true;
    this.pollPage();
  }

  stopPagePolling(): void {
    this.pageActive = false;
    if (this.pageTimer) clearTimeout(this.pageTimer);
    this.pageTimer = null;
  }

  async select(userId: string): Promise<void> {
    runInAction(() => {
      this.selectedUserId = userId;
      this.messages = [];
      this.error = null;
    });
    await this.refreshConversation();
  }

  async reply(text: string): Promise<void> {
    const userId = this.selectedUserId;
    if (!userId || !text.trim()) return;
    runInAction(() => {
      this.sending = true;
      this.error = null;
    });
    try {
      const message = await adminApi.replyToSupportThread(userId, text);
      runInAction(() => {
        if (this.selectedUserId === userId && !this.messages.some((m) => m.id === message.id)) {
          this.messages = [...this.messages, message];
        }
      });
      await this.refreshThreads();
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to send reply');
      });
      throw error;
    } finally {
      runInAction(() => {
        this.sending = false;
      });
    }
  }

  async refreshThreads(): Promise<void> {
    try {
      const threads = await adminApi.listSupportThreads();
      runInAction(() => {
        this.threads = threads;
      });
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to load conversations');
      });
    }
  }

  /** Loads the selected thread and marks the user's messages read (the badge counters follow on the next refresh). */
  private async refreshConversation(): Promise<void> {
    const userId = this.selectedUserId;
    if (!userId) return;
    try {
      const messages = await adminApi.listSupportMessages(userId);
      if (this.selectedUserId !== userId) return;
      runInAction(() => {
        this.messages = messages;
      });
      if (messages.some((m) => m.authorRole === 'user' && m.readAt === null)) {
        await adminApi.markSupportThreadRead(userId);
      }
      await Promise.all([this.refreshThreads(), this.refreshUnread()]);
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to load messages');
      });
    }
  }

  private async refreshUnread(): Promise<void> {
    try {
      const { count } = await adminApi.getSupportUnread();
      runInAction(() => {
        this.unreadTotal = count;
      });
    } catch {
      // Transient; the next tick retries.
    }
  }

  private async pollUnread(): Promise<void> {
    if (!this.unreadActive) return;
    await this.refreshUnread();
    if (!this.unreadActive) return;
    this.unreadTimer = setTimeout(() => this.pollUnread(), POLL_MS);
  }

  private async pollPage(): Promise<void> {
    if (!this.pageActive) return;
    await this.refreshThreads();
    if (this.selectedUserId) await this.refreshConversation();
    if (!this.pageActive) return;
    this.pageTimer = setTimeout(() => this.pollPage(), POLL_MS);
  }
}

export const adminSupportStore = new AdminSupportStore();
