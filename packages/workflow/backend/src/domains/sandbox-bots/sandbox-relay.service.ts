// oxlint-disable complexity, init-declarations, no-undefined -- one linear validate-then-forward pipeline; absent values are real.
import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { runWithEgressVendor } from '@falang/workflow-egress';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { SandboxBindingsService } from './sandbox-bindings.service.js';
import { SandboxBotsService } from './sandbox-bots.service.js';

/** Per chat: a burst of 3, then one call per second. Per project: 60 calls per minute. */
const CHAT_BURST = 3;
const CHAT_REFILL_MS = 1000;
const PROJECT_LIMIT = 60;
const PROJECT_WINDOW_MS = 60_000;
/** Headers that carry the pod's own auth or describe the transport hop — never forwarded upstream. */
const DROPPED_UPSTREAM_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'authorization',
  'x-internal-project-token',
  'cookie',
]);

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

interface IBucket {
  tokens: number;
  at: number;
}

/**
 * The outbound relay (ADR 0073 (private)): a runner pod's sandbox-mode vendor calls land here instead of at the messenger.
 * The adapter inspects the call (allowlist, recipients), the host checks the token and that every recipient is a live chat
 * bound to the calling project, applies rate limits, and only then forwards with the real test-bot token.
 */
@Injectable()
export class SandboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly bots: SandboxBotsService;
  private readonly bindings: SandboxBindingsService;
  private readonly tokens: ProjectTokenService;
  private readonly chatBuckets = new Map<string, IBucket>();
  private readonly projectWindows = new Map<string, { count: number; start: number }>();
  /** Test seam: the upstream HTTP call. */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);
  now: () => number = () => Date.now();

  constructor(
    @Inject(SandboxBotsService) bots: SandboxBotsService,
    @Inject(SandboxBindingsService) bindings: SandboxBindingsService,
    @Inject(ProjectTokenService) tokens: ProjectTokenService,
  ) {
    this.bots = bots;
    this.bindings = bindings;
    this.tokens = tokens;
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
  }

  async relay(vendor: string, projectId: string, req: IRelayRequest): Promise<IRelayResponse> {
    const bot = this.bots.getBot(vendor);
    if (!bot) return errorResponse(412, 'sandbox_not_configured: no test bot is configured for this messenger');
    const { adapter, token } = bot;

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (!value || DROPPED_UPSTREAM_HEADERS.has(name.toLowerCase())) continue;
      for (const item of typeof value === 'string' ? [value] : value) headers.append(name.toLowerCase(), item);
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

    const recipients = [...new Set(decision.recipients)];
    const live = await this.bindings.findLiveForChats(vendor, recipients);
    const allowed = new Set(live.filter((binding) => binding.projectId === projectId).map((binding) => binding.chatId));
    for (const recipient of recipients) {
      if (!allowed.has(recipient)) return errorResponse(403, 'Forbidden: the chat is not connected to the test bot');
    }

    const projectWait = this.takeProject(projectId);
    if (projectWait > 0) return errorResponse(429, `Too Many Requests: retry after ${projectWait}`, projectWait);
    for (const recipient of recipients) {
      const wait = this.takeChat(`${vendor}:${recipient}`);
      if (wait > 0) return errorResponse(429, `Too Many Requests: retry after ${wait}`, wait);
    }

    const upstreamHeaders = new Headers(headers);
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
    if (upstream.ok) await this.bindings.touch(live.filter((binding) => allowed.has(binding.chatId)).map((b) => b.id));
    return { status: upstream.status, contentType: upstream.headers.get('content-type') ?? undefined, body };
  }
}
