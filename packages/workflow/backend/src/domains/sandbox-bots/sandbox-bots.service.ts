// oxlint-disable no-await-in-loop, complexity, max-lines, no-undefined, unicorn/no-useless-undefined, unicorn/no-useless-spread -- reconcile handles one messenger at a time; the router is one linear decision list.
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { runWithEgressVendor } from '@falang/workflow-egress';
import {
  IntegrationsRuntimeService,
  deriveIntegrationSecret,
  resolveWebhookSecretKey,
  type ISandboxIngressPort,
  type ISandboxIngressTarget,
} from '@falang/workflow-gateway';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { ISandboxBotAdapter, IWorkflowIntegration, TWebhookHandler } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { Document } from '../projects/documents/document.entity.js';
import { Project } from '../projects/projects/project.entity.js';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import { UsersService } from '../users/users/users.service.js';
import { SandboxBindingsService } from './sandbox-bindings.service.js';
import { buildSandboxBotTexts, type ISandboxBotTexts } from './sandbox-bot-texts.js';
import { SandboxBotSettingsService } from './sandbox-bot-settings.service.js';
import { SANDBOX_INTEGRATIONS } from './sandbox-integrations.js';

const RECONCILE_INTERVAL_MS = 30_000;
const SWEEP_INTERVAL_MS = 10 * 60_000;
/** A chat gets the "groups are not supported" reply at most once per this window. */
const GROUP_REPLY_WINDOW_MS = 60 * 60_000;

interface IActiveBot {
  readonly adapter: ISandboxBotAdapter;
  readonly token: string;
  readonly commandName: string;
  dispose: (() => Promise<void>) | undefined;
  readonly intervals: NodeJS.Timeout[];
}

type TUpdateHandler = (update: unknown) => Promise<void>;

const subscriberKey = (target: ISandboxIngressTarget): string =>
  `${target.vendor}:${target.projectId}:${target.credentialId}`;

/**
 * Owns the single update consumer of every configured test bot, routes each update (link code, service command, bound
 * project) and keeps the registry of dev-target subscribers (ADR 0073 (private)). Messenger specifics live in the vendor's
 * `ISandboxBotAdapter`; this class knows no messenger by name.
 */
@Injectable()
export class SandboxBotsService implements ISandboxIngressPort, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SandboxBotsService.name);
  private readonly integrations: readonly IWorkflowIntegration[];
  private readonly settings: SandboxBotSettingsService;
  private readonly bindings: SandboxBindingsService;
  private readonly projects: Repository<Project>;
  private readonly documents: Repository<Document>;
  private readonly config: ConfigService;
  private readonly users: UsersService;
  private readonly journal: RunJournalService | undefined;
  private readonly runtime: IntegrationsRuntimeService | undefined;

  private readonly active = new Map<string, IActiveBot>();
  private readonly webhookHandlers = new Map<string, TWebhookHandler>();
  private readonly subscribers = new Map<string, TUpdateHandler>();
  private readonly groupReplies = new Map<string, number>();
  private reconcileChain: Promise<void> = Promise.resolve();
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(SANDBOX_INTEGRATIONS) integrations: readonly IWorkflowIntegration[],
    @Inject(SandboxBotSettingsService) settings: SandboxBotSettingsService,
    @Inject(SandboxBindingsService) bindings: SandboxBindingsService,
    @InjectRepository(Project) projects: Repository<Project>,
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ConfigService) config: ConfigService,
    @Inject(UsersService) users: UsersService,
    @Optional() @Inject(RunJournalService) journal?: RunJournalService,
    @Optional() @Inject(IntegrationsRuntimeService) runtime?: IntegrationsRuntimeService,
  ) {
    this.integrations = integrations;
    this.settings = settings;
    this.bindings = bindings;
    this.projects = projects;
    this.documents = documents;
    this.config = config;
    this.users = users;
    this.journal = journal;
    this.runtime = runtime;
  }

  /** Every vendor with a sandbox adapter. */
  listSandboxIntegrations(): readonly IWorkflowIntegration[] {
    return this.integrations;
  }

  getAdapter(vendor: string): ISandboxBotAdapter | undefined {
    return this.integrations.find((integration) => integration.vendor === vendor)?.sandbox;
  }

  /** The running test bot's token and command name for `vendor`, or `undefined` when none is configured. */
  getBot(vendor: string): { token: string; commandName: string; adapter: ISandboxBotAdapter } | undefined {
    const bot = this.active.get(vendor);
    return bot ? { token: bot.token, commandName: bot.commandName, adapter: bot.adapter } : undefined;
  }

  findWebhookHandler(vendor: string): TWebhookHandler | undefined {
    return this.webhookHandlers.get(vendor);
  }

  onApplicationBootstrap(): void {
    this.runtime?.setSandboxIngress(this);
    this.requestReconcile().catch(() => undefined);
    this.timers = [
      setInterval(() => {
        this.requestReconcile().catch(() => undefined);
      }, RECONCILE_INTERVAL_MS),
      setInterval(() => {
        this.bindings.sweep().catch((error: unknown) => {
          this.logger.error('Sandbox bindings sweep failed', error instanceof Error ? error.stack : error);
        });
      }, SWEEP_INTERVAL_MS),
    ];
    for (const timer of this.timers) timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    await this.reconcileChain;
    for (const vendor of [...this.active.keys()]) await this.stopBot(vendor);
  }

  // --- ISandboxIngressPort ---

  getBotFields(vendor: string): Readonly<Record<string, string>> | undefined {
    const bot = this.active.get(vendor);
    return bot ? { [bot.adapter.tokenField]: bot.token } : undefined;
  }

  subscribe(target: ISandboxIngressTarget, handler: TUpdateHandler): () => void {
    const key = subscriberKey(target);
    this.subscribers.set(key, handler);
    // The stand just (re)started: make the menus of its connected chats show the project's current commands.
    this.refreshProjectChatCommands(target).catch(() => undefined);
    return () => {
      if (this.subscribers.get(key) === handler) this.subscribers.delete(key);
    };
  }

  // --- per-chat command menu ---

  private async refreshProjectChatCommands(target: ISandboxIngressTarget): Promise<void> {
    if (!this.active.get(target.vendor)?.adapter.chatCommands) return;
    const live = await this.bindings.listLive(target.projectId, target.credentialId);
    for (const { binding } of live) {
      await this.refreshChatCommands(target.vendor, binding.chatId, binding);
    }
  }

  /**
   * Makes the chat's command menu the bound project's commands plus the service command (`bound` = the chat's binding), or
   * only the service command for a chat without one. Only for adapters that have a per-chat menu; best-effort — a failure
   * is logged and never reaches routing or the binding.
   */
  async refreshChatCommands(
    vendor: string,
    chatId: string,
    bound: { projectId: string; credentialId: string } | null,
  ): Promise<void> {
    const bot = this.active.get(vendor);
    const menu = bot?.adapter.chatCommands;
    if (!bot || !menu) return;
    try {
      const service = { command: bot.commandName, description: this.texts().serviceCommandDescription() };
      let projectCommands: readonly { command: string; description: string }[] = [];
      if (bound) {
        const docs = await this.documents.find({ where: { projectId: bound.projectId, type: TRIGGER_FUNCTION_NAME } });
        projectCommands = menu.list(
          docs.map((doc) => ({ id: doc.id, name: doc.name, data: doc.data, root: doc.root })),
          bound.credentialId,
        );
      }
      const commands = [service, ...projectCommands.filter((entry) => entry.command !== service.command)];
      await runWithEgressVendor(vendor, () => menu.set(bot.token, chatId, commands));
    } catch (error) {
      this.logger.warn(
        `Could not update the command menu of a ${vendor} chat: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // --- configuration lifecycle ---

  /** Re-reads the settings and (re)starts or stops each vendor's ingress; serialised. Called on admin changes and every 30 s. */
  requestReconcile(): Promise<void> {
    const run = this.reconcileChain.then(() => this.reconcile());
    this.reconcileChain = run.catch(() => undefined);
    return run;
  }

  private async reconcile(): Promise<void> {
    for (const integration of this.integrations) {
      const adapter = integration.sandbox;
      if (!adapter) continue;
      const vendor = integration.vendor;
      try {
        const stored = await this.settings.load(vendor);
        const current = this.active.get(vendor);
        if (!stored) {
          if (current) {
            await this.stopBot(vendor);
            await this.runtime?.restartSandboxTargets(vendor);
          }
          continue;
        }
        if (current && current.token === stored.token && current.commandName === stored.commandName) {
          if (!current.dispose) await this.startIngress(vendor, current);
          continue;
        }
        const tokenChanged = current?.token !== stored.token;
        if (current) await this.stopBot(vendor);
        const bot: IActiveBot = {
          adapter,
          token: stored.token,
          commandName: stored.commandName,
          dispose: undefined,
          intervals: [],
        };
        this.active.set(vendor, bot);
        await this.startIngress(vendor, bot);
        if (tokenChanged) await this.runtime?.restartSandboxTargets(vendor);
      } catch (error) {
        this.logger.error(`Sandbox bot reconcile failed for ${vendor}`, error instanceof Error ? error.stack : error);
      }
    }
  }

  private async startIngress(vendor: string, bot: IActiveBot): Promise<void> {
    const publicHost = this.config.get<string>('GATEWAY_PUBLIC_HOST');
    const webhookUrl = publicHost ? `${publicHost.replace(/\/+$/, '')}/webhooks/sandbox-bots/${vendor}` : null;
    try {
      const inVendor = <T>(fn: () => T): T => runWithEgressVendor(vendor, fn);
      const dispose = await inVendor(() =>
        bot.adapter.startIngress({
          token: bot.token,
          webhookUrl,
          secret: this.deriveIngressSecret(vendor),
          registerWebHook: (handler) => {
            this.webhookHandlers.set(vendor, (request, info) => inVendor(() => handler(request, info)));
          },
          registerInterval: (callback, intervalMs) => {
            let running = false;
            const handle = setInterval(() => {
              if (running) return;
              running = true;
              inVendor(() => callback())
                .catch((error: unknown) => {
                  this.logger.error(`Sandbox poll failed for ${vendor}`, error instanceof Error ? error.stack : error);
                })
                .finally(() => {
                  running = false;
                });
            }, intervalMs);
            bot.intervals.push(handle);
          },
          onUpdate: (update) => this.handleUpdate(vendor, update),
        }),
      );
      bot.dispose = dispose;
    } catch (error) {
      // Retried by the next reconcile tick; targets still start (the bot is configured, only its consumer failed).
      this.logger.error(
        `Failed to start the sandbox ingress of ${vendor}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private deriveIngressSecret(vendor: string): string {
    const key = resolveWebhookSecretKey(this.config);
    if (!key) throw new Error('No webhook secret key configured');
    return deriveIntegrationSecret({
      key,
      projectId: 'sandbox-bots',
      credentialId: vendor,
      env: 'dev',
      vendor,
      label: 'sandbox-bot-ingress',
    });
  }

  private async stopBot(vendor: string): Promise<void> {
    const bot = this.active.get(vendor);
    if (!bot) return;
    this.active.delete(vendor);
    this.webhookHandlers.delete(vendor);
    for (const handle of bot.intervals) clearInterval(handle);
    try {
      await runWithEgressVendor(vendor, () => bot.dispose?.() ?? Promise.resolve());
    } catch (error) {
      this.logger.error(
        `Failed to stop the sandbox ingress of ${vendor}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  // --- routing ---

  private texts(): ISandboxBotTexts {
    return buildSandboxBotTexts(this.users.defaultLanguage());
  }

  private async reply(vendor: string, chatId: string, text: string): Promise<void> {
    const bot = this.active.get(vendor);
    if (!bot) return;
    try {
      await runWithEgressVendor(vendor, () => bot.adapter.sendText(bot.token, chatId, text));
    } catch (error) {
      this.logger.warn(
        `Could not send a service text to ${vendor} chat: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Sends a plain service text from the vendor's test bot (used by the user routes, e.g. "disconnected"). */
  sendServiceText(vendor: string, chatId: string, text: string): Promise<void> {
    return this.reply(vendor, chatId, text);
  }

  serviceTexts(): ISandboxBotTexts {
    return this.texts();
  }

  async handleUpdate(vendor: string, update: unknown): Promise<void> {
    const bot = this.active.get(vendor);
    if (!bot) return;
    try {
      await this.route(vendor, bot, update);
    } catch (error) {
      this.logger.error(`Sandbox update handling failed for ${vendor}`, error instanceof Error ? error.stack : error);
    }
  }

  private async route(vendor: string, bot: IActiveBot, update: unknown): Promise<void> {
    const info = bot.adapter.describeUpdate(update);
    if (!info) return;
    const texts = this.texts();
    const reply = (text: string): Promise<void> => this.reply(vendor, info.chatId, text);

    if (!info.isPrivateChat) {
      const key = `${vendor}:${info.chatId}`;
      const last = this.groupReplies.get(key) ?? 0;
      if (Date.now() - last > GROUP_REPLY_WINDOW_MS) {
        this.groupReplies.set(key, Date.now());
        await reply(texts.groupsUnsupported());
      }
      return;
    }

    const code = this.bindings.parsePayload(info.startPayload);
    const redeemed =
      code === null
        ? null
        : await this.bindings.redeem(vendor, code, { chatId: info.chatId, chatTitle: info.chatTitle });
    if (redeemed && !redeemed.ok && redeemed.reason !== 'already-bound-here') return reply(texts.linkInvalid());
    if (redeemed?.ok) {
      const project = await this.projects.findOneBy({ id: redeemed.binding.projectId });
      await reply(project ? texts.linked(project.name) : texts.linkInvalid());
      if (project) await this.refreshChatCommands(vendor, info.chatId, redeemed.binding);
      return;
    }
    // `redeemed` is null (no link) or the repeat of an already used link from the bound chat: route as a plain message.

    const command = `/${bot.commandName}`;
    const text = info.text?.trim() ?? null;
    if (text === command || text === `${command} off`) {
      const binding = await this.bindings.findBinding(vendor, info.chatId);
      const live = binding !== null && (await this.bindings.isLive(binding));
      if (text === command) {
        if (!binding || !live) return reply(texts.statusNotConnected());
        const project = await this.projects.findOneBy({ id: binding.projectId });
        return reply(texts.status(project?.name ?? '', bot.commandName));
      }
      if (binding) await this.bindings.remove(binding);
      await reply(texts.disconnected());
      if (binding) await this.refreshChatCommands(vendor, info.chatId, null);
      return;
    }

    const binding = await this.bindings.findBinding(vendor, info.chatId);
    if (!binding) return reply(texts.notConnected());
    if (!(await this.bindings.isLive(binding))) return reply(texts.expired());

    const handler = this.subscribers.get(
      subscriberKey({ vendor, projectId: binding.projectId, credentialId: binding.credentialId }),
    );
    if (!handler) {
      const project = await this.projects.findOneBy({ id: binding.projectId });
      await this.journal?.recordProblem({
        projectId: binding.projectId,
        env: 'dev',
        workflowId: `sandbox-${vendor}-${info.chatId}`,
        vendor,
        message: 'Undeliverable input: the test stand is stopped',
        data: { update },
      });
      return reply(texts.standStopped(project?.name ?? ''));
    }
    await this.bindings.touch([binding.id]);
    try {
      await runWithEgressVendor(vendor, () => handler(update));
    } catch (error) {
      this.logger.error(
        `Sandbox subscriber failed for ${vendor}/${binding.projectId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
