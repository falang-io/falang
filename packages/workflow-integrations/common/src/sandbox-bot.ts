import type { IIntegrationDocumentRecord, TWebhookHandler } from './backend-runtime.js';

/**
 * Sandbox messenger bots (ADR 0073 (private)): the platform runs one test bot per messenger; a chat bound to a project
 * via a one-time link talks to that project's **dev** stand through it. Everything messenger-specific lives in the vendor
 * package as an `ISandboxBotAdapter` (`IWorkflowIntegration.sandbox`); the host (`@falang/workflow-backend`'s
 * sandbox-bots domain) owns the single update consumer per bot, the chat bindings, the link codes and the outbound relay,
 * and knows no messenger by name. The real test-bot token never leaves the host process — runner pods talk to the relay.
 *
 * Must stay browser-safe (no `node:*` imports): vendor packages are also bundled into the client.
 */

/** Prefix of the start/ref payload of a link that binds a chat to a project (`fl_<code>`). Anything else is the project's own. */
export const SANDBOX_LINK_PAYLOAD_PREFIX = 'fl_';

/** What the host hands an adapter to consume the test bot's updates — the same webhook-or-poll split as `IIntegrationBackendContext`. */
export interface ISandboxIngressContext {
  /** The real test-bot token (or the vendor's equivalent credential). */
  readonly token: string;
  /** Full external URL of this bot's webhook route when the host has a public URL, else `null` (poll instead). */
  readonly webhookUrl: string | null;
  /** A stable secret (derived by the host, never stored) for the vendor's webhook verification, e.g. Telegram's `secret_token`. */
  readonly secret: string;
  /** Mounts the webhook handler at `webhookUrl`; removed by the host when the ingress stops. */
  registerWebHook(handler: TWebhookHandler): void;
  /** Runs `callback` every `intervalMs` while the ingress is active (never overlapping); cleared by the host on stop. */
  registerInterval(callback: () => Promise<void>, intervalMs: number): void;
  /** Hands one raw vendor update to the host, in order. The host routes it (link code, service command, bound project). */
  onUpdate(update: unknown): Promise<void>;
}

/** The routing facts the host needs from one raw update. */
export interface ISandboxUpdateInfo {
  /** The chat the update belongs to, as a string (Telegram/MAX numeric ids, VK `peer_id`). */
  readonly chatId: string;
  /** Group chats are not supported in v1 — the host ignores them (one service reply at most). */
  readonly isPrivateChat: boolean;
  /** The raw start/ref payload carried by this update (Telegram `/start <payload>`, MAX `bot_started.payload`, VK `ref`), else `null`. */
  readonly startPayload: string | null;
  /** The plain text of a message update (for the service command), else `null`. */
  readonly text: string | null;
  /** A human-readable name of the chat/user for the editor's "connected chats" list, if the update carries one. */
  readonly chatTitle: string | null;
}

/** An allowed outbound call: what it addresses and the relay token it carries. */
export interface ISandboxRelayCall {
  /** The vendor API method being called, e.g. `sendMessage` — logged and rate-limited by the host. */
  readonly method: string;
  /** Every chat the call addresses; the host refuses the call unless each is bound to the calling project. */
  readonly recipients: readonly string[];
  /**
   * Messages the call addresses by id only, without naming a chat (MAX `PUT /messages?message_id=…`,
   * `GET /messages/<mid>`). The host allows each only if it recorded that message as sent by the calling project
   * (`ISandboxRelay.sentMessages`) and the message's chat is still bound, live, to that project; that chat then counts as
   * a recipient for rate limits and the binding's activity.
   */
  readonly messageIds?: readonly string[];
  /**
   * The call addresses no chat and no message (MAX `POST /uploads`, which only hands out an upload URL). Only the
   * project rate limit applies. Without this flag a call with no `recipients` and no `messageIds` is refused.
   */
  readonly unaddressed?: boolean;
  /** The relay token the pod presented (the project's internal token); the host verifies it for the project in the URL. */
  readonly relayToken: string;
}

/** The relay's verdict on one outbound call a runner pod sent to the relay instead of the vendor API. */
export type TSandboxRelayDecision = ISandboxRelayCall | { readonly error: string };

/** One message a relayed call created — recorded by the host so later id-only calls (`messageIds`) can be checked. */
export interface ISandboxSentMessage {
  readonly messageId: string;
  readonly chatId: string;
}

export interface ISandboxRelay {
  /**
   * Inspects one outbound request without consuming the caller's copy (the host passes a clone). `path` is what follows
   * the relay base URL the pod was given (e.g. `/bot<relayToken>/sendMessage` for Telegram, `/messages` for MAX),
   * `request` carries the method, the pod's headers (including its `Authorization`, where MAX puts the relay token —
   * the host drops it only from the upstream call), query and body (JSON or multipart — `request.formData()` works).
   * Methods outside the adapter's allowlist, and calls whose recipients can't be determined, are `{ error }`.
   */
  inspect(request: Request, path: string): Promise<TSandboxRelayDecision>;
  /** The real vendor URL for `path` + `search` (`?a=b` or `''`) with the relay token replaced by the real `token`. */
  upstreamUrl(token: string, path: string, search: string): string;
  /** Extra headers the upstream call needs that carry the real token (e.g. MAX `Authorization`); the host drops the pod's own auth headers. */
  upstreamHeaders?(token: string): Readonly<Record<string, string>>;
  /**
   * The messages a successful (2xx) upstream answer to `call` created, for the host's ownership table. `responseBody` is
   * the parsed JSON answer, or `undefined` when it isn't JSON. Only vendors whose edit methods address a message by id
   * alone need it (MAX); Telegram's edits carry `chat_id` and are checked as recipients.
   */
  sentMessages?(call: ISandboxRelayCall, responseBody: unknown): readonly ISandboxSentMessage[];
}

export interface ISandboxBotInfo {
  /** The public handle used in deep links (Telegram/MAX bot username, VK community short name or `club<id>`). */
  readonly username: string;
  /** Display name shown in the editor and the admin page. */
  readonly title: string;
}

/** One entry of a chat's command menu (Telegram's `/` button): `command` without the slash, `description` for the menu. */
export interface ISandboxChatCommand {
  readonly command: string;
  readonly description: string;
}

/**
 * The per-chat command menu of a messenger that has one (Telegram `setMyCommands` with a chat scope). The host keeps the
 * menu of a bound chat equal to the project's commands plus its own service command; best-effort, never fatal.
 */
export interface ISandboxChatCommands {
  /**
   * The commands the bound project's stand answers: from its `trigger-function` documents (as the adapter's vendor binds
   * them to `credentialId`). Entries the messenger would reject are skipped; the service command is added by the host.
   */
  list(documents: readonly IIntegrationDocumentRecord[], credentialId: string): readonly ISandboxChatCommand[];
  /** Replaces the chat's menu; an empty list removes the chat-specific menu altogether. */
  set(token: string, chatId: string, commands: readonly ISandboxChatCommand[]): Promise<void>;
}

/** A vendor's messenger-specific half of the sandbox bot. */
export interface ISandboxBotAdapter {
  /** The credential field that holds the bot token (`botToken`) — the resolver answers it with the relay for a sandbox dev instance. */
  readonly tokenField: string;
  /** Starts consuming the test bot's updates; returns the dispose function (e.g. `deleteWebhook`). */
  startIngress(ctx: ISandboxIngressContext): Promise<() => Promise<void>>;
  /** Routing facts of one raw update, or `null` for an update the host should ignore (service updates, unknown types). */
  describeUpdate(update: unknown): ISandboxUpdateInfo | null;
  /** Sends a plain service text from the test bot (link confirmations, "stand stopped", "connection expired"). */
  sendText(token: string, chatId: string, text: string): Promise<void>;
  /** Checks the token and returns the bot's public identity — used on save in the admin page. Throws on a bad token. */
  getBotInfo(token: string): Promise<ISandboxBotInfo>;
  /** The deep link that opens the bot with `payload` (`https://t.me/<username>?start=<payload>`). */
  buildChatLink(info: ISandboxBotInfo, payload: string): string;
  readonly relay: ISandboxRelay;
  /** Per-chat command menu; absent for messengers that have none (MAX has only a bot-wide menu, VK none). */
  readonly chatCommands?: ISandboxChatCommands;
}

/**
 * `IIntegrationBackendContext.sharedIngress` — present only on a **dev** target of an instance in sandbox mode while the
 * host has a test bot configured for the vendor. The vendor's `registerBackend` then subscribes instead of polling or
 * calling `setWebhook` (the host owns the bot's only consumer); `ctx.fields[adapter.tokenField]` is the real test-bot
 * token inside the host process (for `answerCallbackQuery`, media downloads), never handed to a runner pod.
 */
export interface ISharedIngress {
  /** `handler` receives every update of a chat bound to this target, after the host handled link codes and the service command. Unsubscribed by the host when the target stops. */
  subscribe(handler: (update: unknown) => Promise<void>): void;
}
