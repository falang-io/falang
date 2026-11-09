// oxlint-disable complexity, init-declarations, no-undefined, max-lines -- one linear validate-then-forward pipeline; absent values are real.
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { runWithEgressVendor } from '@falang/workflow-egress';
import type { ISandboxRelay, ISandboxRelayCall } from '@falang/workflow-integrations-common';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { SANDBOX_MESSAGES_PER_HOUR, SandboxAbuseService } from './sandbox-abuse.service.js';
import { SandboxBindingsService } from './sandbox-bindings.service.js';
import { SandboxBotsService } from './sandbox-bots.service.js';

/** Per chat: a burst of 3, then one call per second. Per project: 60 calls per minute. */
const CHAT_BURST = 3;
const CHAT_REFILL_MS = 1000;
const PROJECT_LIMIT = 60;
const PROJECT_WINDOW_MS = 60_000;
/** Transport-hop headers (and cookies) — never shown to the adapter nor forwarded upstream. */
const TRANSPORT_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'cookie',
]);
/** The pod's own auth: visible to the adapter (MAX carries the relay token in `Authorization`), never forwarded upstream. */
const POD_AUTH_HEADERS = new Set(['authorization', 'x-internal-project-token']);
const MESSAGE_DENIED = "Forbidden: the message does not belong to this project's connected chat";
const BLOCKED =
  'Forbidden: sandbox_blocked: the test bot is blocked for the project owner after too many undeliverable messages; an administrator can lift the block';

export interface IRelayRequest {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** The part of the URL after the relay base URL, e.g. `/bot<token>/sendMessage`. */
  readonly path: string;
  /** `?a=b` or `''`. */
  readonly search: string;
  readonly body: Uint8Array | undefined;
}

export interface IRelayResponse {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly body: Uint8Array;
}

/** The vendor-shaped error answer (Telegram-like `{ ok:false, error_code, description }`; the other messengers read `description`/`error_code` loosely). */
const errorResponse = (status: number, description: string, retryAfter?: number): IRelayResponse => ({
  status,
  contentType: 'application/json',
  body: Buffer.from(
    JSON.stringify({
      ok: false,
      error_code: status,
      description,
      ...(retryAfter === undefined ? {} : { parameters: { retry_after: retryAfter } }),
    }),
  ),
});

const parseJson = (body: Uint8Array): unknown => {
  try {
    return JSON.parse(Buffer.from(body).toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
};

interface IBucket {
  tokens: number;
  at: number;
}

/**
 * The outbound relay (ADR 0073 (private)): a runner pod's sandbox-mode vendor calls land here instead of at the messenger.
 * The adapter inspects the call (allowlist, recipients), the host checks the token and that every recipient is a live chat
 * bound to the calling project, refuses an owner the test bot is blocked for, applies rate limits (per project, per chat,
 * and the owner's hourly message limit for sends), and only then forwards with the real test-bot token. A send the
 * messenger refuses because the bot can't reach the chat counts towards the owner's block (`SandboxAbuseService`).
 */
@Injectable()
export class SandboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SandboxRelayService.name);
  private readonly bots: SandboxBotsService;
  private readonly bindings: SandboxBindingsService;
  private readonly tokens: ProjectTokenService;
  private readonly projects: ProjectsService;
  private readonly abuse: SandboxAbuseService;
  private readonly chatBuckets = new Map<string, IBucket>();
  private readonly projectWindows = new Map<string, { count: number; start: number }>();
  /** Test seam: the upstream HTTP call. */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);
  now: () => number = () => Date.now();

  constructor(
    @Inject(SandboxBotsService) bots: SandboxBotsService,
    @Inject(SandboxBindingsService) bindings: SandboxBindingsService,
    @Inject(ProjectTokenService) tokens: ProjectTokenService,
    @Inject(ProjectsService) projects: ProjectsService,
    @Inject(SandboxAbuseService) abuse: SandboxAbuseService,
  ) {
    this.bots = bots;
    this.bindings = bindings;
    this.tokens = tokens;
    this.projects = projects;
    this.abuse = abuse;
  }

  private pruneTimer: NodeJS.Timeout | undefined;

  onApplicationBootstrap(): void {
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }

  private takeChat(key: string): number {
    const now = this.now();
    const bucket = this.chatBuckets.get(key) ?? { tokens: CHAT_BURST, at: now };
    bucket.tokens = Math.min(CHAT_BURST, bucket.tokens + (now - bucket.at) / CHAT_REFILL_MS);
    bucket.at = now;
    if (bucket.tokens < 1) {
      this.chatBuckets.set(key, bucket);
      return Math.max(1, Math.ceil(((1 - bucket.tokens) * CHAT_REFILL_MS) / 1000));
    }
    bucket.tokens -= 1;
    this.chatBuckets.set(key, bucket);
    return 0;
  }

  private takeProject(projectId: string): number {
    const now = this.now();
    const window = this.projectWindows.get(projectId);
    if (!window || now - window.start >= PROJECT_WINDOW_MS) {
      this.projectWindows.set(projectId, { count: 1, start: now });
      return 0;
    }
    if (window.count >= PROJECT_LIMIT) return Math.max(1, Math.ceil((window.start + PROJECT_WINDOW_MS - now) / 1000));
    window.count += 1;
    return 0;
  }

  /** Drops idle limiter state; called from the periodic sweep. */
  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.chatBuckets) if (now - bucket.at > 60_000) this.chatBuckets.delete(key);
    for (const [key, window] of this.projectWindows) {
      if (now - window.start >= PROJECT_WINDOW_MS) this.projectWindows.delete(key);
    }
    this.abuse.prune();
  }

  /** Stores the messages a successful call created, for later id-only calls. Never fails the call. */
  private async recordSentMessages(
    vendor: string,
    projectId: string,
    relay: ISandboxRelay,
    call: ISandboxRelayCall,
    recipients: readonly string[],
    parsed: unknown,
  ): Promise<void> {
    if (!relay.sentMessages || parsed === undefined) return;
    try {
      const sent = relay.sentMessages(call, parsed).filter((item) => recipients.includes(item.chatId));
      await this.bindings.recordMessages(vendor, projectId, sent);
    } catch (error) {
      this.logger.warn(`Could not record sent sandbox messages: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Feeds a "the bot can't reach the chat" answer into the account's abuse counter. Never fails the call. */
  private async countUnreachable(
    vendor: string,
    ownerId: string,
    projectId: string,
    relay: ISandboxRelay,
    call: ISandboxRelayCall,
    recipients: readonly string[],
    status: number,
    parsed: unknown,
  ): Promise<void> {
    try {
      if (!relay.isChatUnreachable?.(call, status, parsed)) return;
      await this.abuse.recordUnreachable(vendor, ownerId, { projectId, chatId: recipients[0] ?? null });
    } catch (error) {
      this.logger.warn(
        `Could not count an undeliverable sandbox message: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async relay(vendor: string, projectId: string, req: IRelayRequest): Promise<IRelayResponse> {
    const bot = this.bots.getBot(vendor);
    if (!bot) return errorResponse(412, 'sandbox_not_configured: no test bot is configured for this messenger');
    const { adapter, token } = bot;

    const headers = new Headers();
    const upstreamBase = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      if (!value || TRANSPORT_HEADERS.has(lower)) continue;
      for (const item of typeof value === 'string' ? [value] : value) {
        headers.append(lower, item);
        if (!POD_AUTH_HEADERS.has(lower)) upstreamBase.append(lower, item);
      }
    }
    const contentLength = req.body?.byteLength;
    const request = new Request(`http://relay.invalid${req.path}${req.search}`, {
      method: req.method,
      headers,
      ...(req.body && req.method !== 'GET' && req.method !== 'HEAD' ? { body: req.body as BodyInit } : {}),
    });

    let decision: Awaited<ReturnType<typeof adapter.relay.inspect>>;
    try {
      decision = await adapter.relay.inspect(request.clone(), req.path);
    } catch (error) {
      return errorResponse(400, `Bad Request: ${error instanceof Error ? error.message : 'unreadable request'}`);
    }
    if ('error' in decision) return errorResponse(400, `Bad Request: ${decision.error}`);
    if (!this.tokens.verify(projectId, decision.relayToken))
      return errorResponse(403, 'Forbidden: invalid relay token');

    const recipientUsers = [...new Set(decision.recipientUsers)];
    const userBindings = await this.bindings.findLiveForUsers(vendor, projectId, recipientUsers);
    const userChats = new Map(userBindings.map((binding) => [binding.userId, binding.chatId]));
    for (const user of recipientUsers) {
      if (!userChats.has(user)) return errorResponse(403, 'Forbidden: the user is not connected to the test bot');
    }
    // A send by user id is checked, limited and recorded as a send to the user's bound chat.
    const recipients = [...new Set([...decision.recipients, ...userChats.values()])];
    const messageIds = [...new Set(decision.messageIds)];
    const unaddressed = decision.unaddressed === true;
    if (unaddressed && (recipients.length > 0 || messageIds.length > 0)) {
      return errorResponse(400, 'Bad Request: an unaddressed call cannot name chats or messages');
    }
    if (!unaddressed && recipients.length === 0 && messageIds.length === 0) {
      return errorResponse(400, 'Bad Request: the call addresses no chat and no message');
    }

    const owned = await this.bindings.findOwnedMessages(vendor, projectId, messageIds);
    if (owned.length !== messageIds.length) return errorResponse(403, MESSAGE_DENIED);
    const messageChats = [...new Set(owned.map((row) => row.chatId))];
    const chats = [...new Set([...recipients, ...messageChats])];
    const live = await this.bindings.findLiveForChats(vendor, chats);
    const allowed = new Set(live.filter((binding) => binding.projectId === projectId).map((binding) => binding.chatId));
    for (const recipient of recipients) {
      if (!allowed.has(recipient)) return errorResponse(403, 'Forbidden: the chat is not connected to the test bot');
    }
    for (const chat of messageChats) {
      if (!allowed.has(chat)) return errorResponse(403, MESSAGE_DENIED);
    }

    let ownerId: string;
    try {
      ownerId = await this.projects.getOwnerId(projectId);
    } catch {
      return errorResponse(404, 'Not Found: the project does not exist');
    }
    if (await this.abuse.isBlocked(vendor, ownerId)) return errorResponse(403, BLOCKED);

    const projectWait = this.takeProject(projectId);
    if (projectWait > 0) return errorResponse(429, `Too Many Requests: retry after ${projectWait}`, projectWait);
    for (const recipient of chats) {
      const wait = this.takeChat(`${vendor}:${recipient}`);
      if (wait > 0) return errorResponse(429, `Too Many Requests: retry after ${wait}`, wait);
    }
    if (decision.sendsMessage === true) {
      const wait = this.abuse.takeMessage(vendor, ownerId);
      if (wait > 0) {
        return errorResponse(
          429,
          `Too Many Requests: the test bot sends at most ${SANDBOX_MESSAGES_PER_HOUR} messages per hour per account; retry after ${wait}`,
          wait,
        );
      }
    }

    const upstreamHeaders = new Headers(upstreamBase);
    for (const [name, value] of Object.entries(adapter.relay.upstreamHeaders?.(token) ?? {})) {
      upstreamHeaders.set(name, value);
    }
    if (contentLength === undefined) upstreamHeaders.delete('content-length');
    let upstream: Response;
    try {
      upstream = await runWithEgressVendor(vendor, () =>
        this.fetchImpl(adapter.relay.upstreamUrl(token, req.path, req.search), {
          method: req.method,
          headers: upstreamHeaders,
          ...(req.body && req.method !== 'GET' && req.method !== 'HEAD' ? { body: req.body as BodyInit } : {}),
        }),
      );
    } catch (error) {
      return errorResponse(502, `Bad Gateway: ${error instanceof Error ? error.message : 'upstream unreachable'}`);
    }
    const body = new Uint8Array(await upstream.arrayBuffer());
    const parsed = parseJson(body);
    if (upstream.ok) {
      await this.bindings.touch(live.filter((binding) => allowed.has(binding.chatId)).map((b) => b.id));
      await this.recordSentMessages(vendor, projectId, adapter.relay, decision, recipients, parsed);
    }
    await this.countUnreachable(
      vendor,
      ownerId,
      projectId,
      adapter.relay,
      decision,
      recipients,
      upstream.status,
      parsed,
    );
    return { status: upstream.status, contentType: upstream.headers.get('content-type') ?? undefined, body };
  }
}
