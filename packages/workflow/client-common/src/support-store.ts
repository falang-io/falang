import { makeObservable, observable, runInAction } from 'mobx';
import { workflowApi, type IApiSupportMessage } from './api-client.js';
import { authStore } from './auth-store.js';

const UNREAD_POLL_MS = 60_000;
const MESSAGES_POLL_MS = 10_000;

const errorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/**
 * The user's side of the support chat (user ↔ administrator, text only, one thread per user). Polling only —
 * no WebSocket. Two timers, both setTimeout-recursion like `TasksStore`:
 * - the unread badge: `GET /support/unread` every 60s while at least one `SupportButton` is mounted and a user is
 *   signed in (`acquire()`/`release()` are refcounted; the button calls them from a `useEffect`);
 * - the open drawer: `GET /support/messages?after=<newest known createdAt>` every 10s while `drawerOpen`.
 * Opening the drawer marks the admin's messages read, and so does each new admin message arriving while it is open.
 */
export class SupportStore {
  @observable messages: IApiSupportMessage[] = [];
  @observable unreadCount = 0;
  @observable drawerOpen = false;
  @observable sending = false;
  @observable error: string | null = null;

  private holders = 0;
  private unreadTimer: ReturnType<typeof setTimeout> | null = null;
  private messagesTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeObservable(this);
  }

  /** A `SupportButton` mounted: starts the unread poll (the first mounted holder starts it). */
  acquire(): void {
    this.holders += 1;
    if (this.holders === 1) this.pollUnread();
  }

  release(): void {
    this.holders = Math.max(0, this.holders - 1);
    if (this.holders === 0) {
      this.clearTimer('unread');
      this.close();
    }
  }

  async open(): Promise<void> {
    runInAction(() => {
      this.drawerOpen = true;
      this.error = null;
    });
    await this.pollMessages(true);
  }

  close(): void {
    runInAction(() => {
      this.drawerOpen = false;
    });
    this.clearTimer('messages');
  }

  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    runInAction(() => {
      this.sending = true;
      this.error = null;
    });
    try {
      // TODO(P3): eventTracker.track('support_message_sent')
      const message = await workflowApi.sendSupportMessage(trimmed);
      runInAction(() => this.mergeMessages([message]));
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to send message');
      });
      throw error;
    } finally {
      runInAction(() => {
        this.sending = false;
      });
    }
  }

  private newestCreatedAt(): string | null {
    return this.messages.at(-1)?.createdAt ?? null;
  }

  private mergeMessages(incoming: readonly IApiSupportMessage[]): void {
    const known = new Set(this.messages.map((m) => m.id));
    const fresh = incoming.filter((m) => !known.has(m.id));
    if (fresh.length > 0) this.messages = [...this.messages, ...fresh];
  }

  private clearTimer(which: 'unread' | 'messages'): void {
    const timer = which === 'unread' ? this.unreadTimer : this.messagesTimer;
    if (timer) clearTimeout(timer);
    if (which === 'unread') this.unreadTimer = null;
    else this.messagesTimer = null;
  }

  private async pollUnread(): Promise<void> {
    this.clearTimer('unread');
    if (this.holders === 0) return;
    if (authStore.currentUser && !this.drawerOpen) {
      try {
        const { count } = await workflowApi.getSupportUnread();
        runInAction(() => {
          this.unreadCount = count;
        });
      } catch {
        // Transient; the next tick retries.
      }
    }
    if (this.holders === 0) return;
    this.unreadTimer = setTimeout(() => this.pollUnread(), UNREAD_POLL_MS);
  }

  private async pollMessages(initial: boolean): Promise<void> {
    this.clearTimer('messages');
    if (!this.drawerOpen) return;
    try {
      const incoming = await workflowApi.listSupportMessages(initial ? null : this.newestCreatedAt());
      const hasNewAdminMessage = incoming.some((m) => m.authorRole === 'admin' && m.readAt === null);
      runInAction(() => this.mergeMessages(incoming));
      if (initial || hasNewAdminMessage) {
        await workflowApi.markSupportRead();
        runInAction(() => {
          this.unreadCount = 0;
        });
      }
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to load messages');
      });
    }
    if (!this.drawerOpen) return;
    this.messagesTimer = setTimeout(() => this.pollMessages(false), MESSAGES_POLL_MS);
  }
}

export const supportStore = new SupportStore();
