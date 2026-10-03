import { makeObservable, observable, runInAction } from 'mobx';
import type { HistoryStore, Scheme } from '@falang/scheme';
import { focusNode } from '@falang/scheme';
import type { ILlmClient, ILlmToolCall, ILlmToolResult, TLlmMessage } from './llm-client.js';
import type { IAgentContextProvider } from './context-provider.js';
import type { IAgentDocumentResolver } from './document-resolver.js';
import { createHomeOnlyDocumentResolver } from './document-resolver.js';
import { getFocusTargetId } from './focus-target.js';
import { AGENT_TOOLS, READ_ONLY_CORE_TOOLS } from './tools.js';
import type { IAgentToolProvider } from './tool-provider.js';
import type { TToolExecutionResult } from './tool-executor.js';
import { executeFinish, executeToolCall } from './tool-executor.js';
import { fail } from './tool-result.js';
import type { IAgentQuestion } from './ask-user.js';
import { ASK_USER_TOOL, executeAskUser, parseAskUserQuestion, resolveQuestionPolicy } from './ask-user.js';
import { supersedeEarlierToolResults } from './supersede-tool-results.js';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import {
  addUsage,
  buildSystemPrompt,
  EMPTY_USAGE,
  DEFAULT_MAX_STEPS,
  FOCUS_PAUSE_MS,
  buildRunContext,
  ensureGroupOpen,
  getFinishMessage,
  isCoreToolOffered,
  resolveTargetScheme,
  type IAgentRunOptions,
  type IAgentSessionExtraOptions,
  sleep,
  type IAgentUsageTotal,
} from './agent-session-internal.js';

export type { IAgentRunOptions, IAgentSessionExtraOptions, IAgentUsageTotal } from './agent-session-internal.js';

const CORE_TOOL_NAMES = new Set(AGENT_TOOLS.map((tool) => tool.name));

export interface IAgentStep {
  readonly call: ILlmToolCall;
  readonly result: TToolExecutionResult;
}

export type TAgentStatus = 'idle' | 'running' | 'done' | 'error' | 'awaiting-answer';

export class AgentSession {
  @observable status: TAgentStatus = 'idle';
  @observable.ref steps: readonly IAgentStep[] = [];
  @observable.ref usage: IAgentUsageTotal = EMPTY_USAGE;
  @observable message = '';
  @observable error = '';
  /** Set when the run ended by calling `ask_user` (status `'awaiting-answer'`); null otherwise (ADR 0047). */
  @observable.ref question: IAgentQuestion | null = null;
  /** The run's full message list when it ended awaiting an answer — pass it as `priorMessages` of the
   *  next `run()` (whose request is the answer) to continue the same conversation. */
  @observable.ref pendingMessages: readonly TLlmMessage[] | null = null;
  /** The raw thrown value behind `error` (in-memory only, never persisted) — lets a host render a typed failure, e.g. a 402. */
  @observable.ref rawError: unknown = null;

  /** Single-scheme fallback (ADR 0036): default active document / resolver target; `null` for project-level. */
  private readonly defaultScheme: Scheme | null;
  private readonly client: ILlmClient;
  private readonly contextProviders: readonly IAgentContextProvider[];
  private readonly documentResolver: IAgentDocumentResolver;
  private readonly onOpenDocument?: (scheme: Scheme) => void;
  private readonly onRunFinished?: () => void;
  private readonly toolProviders: readonly IAgentToolProvider[];
  private readonly nodeKindFilter?: IAgentNodeKindFilter;
  private readonly coreToolAllowlist: ReadonlySet<string> | null;
  private readonly focusPauseMs: number;
  private askOffered = true;
  private abortController: AbortController | null = null;
  /** One undo group per document touched this run (ADR 0034), opened lazily, closed by `closeOpenGroups`. */
  private readonly openGroups = new Map<Scheme, HistoryStore>();

  constructor(
    defaultScheme: Scheme | null,
    client: ILlmClient,
    contextProviders: readonly IAgentContextProvider[],
    extra: IAgentSessionExtraOptions = {},
  ) {
    this.defaultScheme = defaultScheme;
    this.client = client;
    this.contextProviders = contextProviders;
    this.documentResolver = extra.documentResolver ?? createHomeOnlyDocumentResolver(() => this.defaultScheme);
    this.onOpenDocument = extra.onOpenDocument;
    this.onRunFinished = extra.onRunFinished;
    this.toolProviders = extra.toolProviders ?? [];
    this.nodeKindFilter = extra.nodeKindFilter;
    this.coreToolAllowlist = extra.coreTools ? new Set(extra.coreTools) : null;
    this.focusPauseMs = extra.focusPauseMs ?? FOCUS_PAUSE_MS;
    makeObservable(this);
  }

  async run(request: string, options: IAgentRunOptions = {}): Promise<void> {
    if (this.status === 'running') throw new Error('AgentSession: already running');

    const { activeDocumentId, system, offerAskUser } = this.prepareRun(options);
    this.askOffered = offerAskUser;
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const abortController = new AbortController();
    this.abortController = abortController;
    if (options.signal) {
      if (options.signal.aborted) abortController.abort();
      else options.signal.addEventListener('abort', () => abortController.abort());
    }

    runInAction(() => {
      this.status = 'running';
      this.steps = [];
      this.usage = EMPTY_USAGE;
      this.message = '';
      this.error = '';
      this.rawError = null;
      this.question = null;
      this.pendingMessages = null;
    });

    const messages: TLlmMessage[] = [...(options.priorMessages ?? []), { content: request, role: 'user' }];
    const tools = [
      ...AGENT_TOOLS.filter((tool) => isCoreToolOffered(this.coreToolAllowlist, tool.name)),
      ...(offerAskUser ? [ASK_USER_TOOL] : []),
      ...this.toolProviders.flatMap((provider) => provider.tools),
    ];

    try {
      for (let i = 0; i < maxSteps; i += 1) {
        if (abortController.signal.aborted) throw new Error('cancelled');
        // oxlint-disable-next-line no-await-in-loop
        const response = await this.client.complete({
          messages,
          signal: abortController.signal,
          system,
          tools,
        });
        if (response.usage) {
          const { usage } = response;
          runInAction(() => {
            this.usage = addUsage(this.usage, usage);
          });
        }
        messages.push({ content: response.text, role: 'assistant', toolCalls: response.toolCalls });
        if (response.toolCalls.length === 0) {
          runInAction(() => {
            this.status = 'done';
            this.message = response.text;
          });
          return;
        }

        // oxlint-disable-next-line no-await-in-loop
        const { finishMessage, newSteps, question, results } = await this.executeCalls(
          response.toolCalls,
          activeDocumentId,
        );

        runInAction(() => {
          this.steps = [...this.steps, ...newSteps];
        });
        messages.push({ results, role: 'tool' });
        supersedeEarlierToolResults(messages, activeDocumentId);

        if (question !== null) {
          this.endAwaitingAnswer(question, messages);
          return;
        }

        if (finishMessage !== null) {
          const message: string = finishMessage;
          runInAction(() => {
            this.status = 'done';
            this.message = message;
          });
          return;
        }
      }
      throw new Error('Step limit reached');
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
        this.rawError = error;
      });
    } finally {
      this.closeOpenGroups();
      this.abortController = null;
      this.onRunFinished?.();
    }
  }

  /**
   * Ends every undo group the current run has open and forgets them, so the next mutating call reopens one lazily on
   * whatever `Scheme` the resolver then returns. A host calls this (from a tool provider) right before it disposes and
   * rebuilds schemes mid-run (e.g. a new Arduino driver adds node kinds) — the session caches no `Scheme` across calls.
   */
  closeOpenGroups(): void {
    for (const history of this.openGroups.values()) history.endGroup();
    this.openGroups.clear();
  }

  /** Dispatches every call of one response (all of them, so each tool_call gets a result even when one is
   *  `ask_user`/`finish`) and collects the outcome. */
  private async executeCalls(
    calls: readonly ILlmToolCall[],
    activeDocumentId: string | null,
  ): Promise<{
    newSteps: IAgentStep[];
    results: ILlmToolResult[];
    finishMessage: string | null;
    question: IAgentQuestion | null;
  }> {
    const newSteps: IAgentStep[] = [];
    const results: ILlmToolResult[] = [];
    let finishMessage: string | null = null;
    let question: IAgentQuestion | null = null;
    for (const call of calls) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await this.dispatchToolCall(call, activeDocumentId);
      newSteps.push({ call, result });
      results.push({
        content: result.ok ? result.content : result.error,
        isError: !result.ok,
        toolCallId: call.id,
      });
      finishMessage = getFinishMessage(call, result) ?? finishMessage;
      question ??= parseAskUserQuestion(call, result);
    }
    return { finishMessage, newSteps, question, results };
  }

  /** Ends the run on a successful `ask_user` (ADR 0047); it wins over a `finish` in the same response. */
  private endAwaitingAnswer(question: IAgentQuestion, messages: readonly TLlmMessage[]): void {
    runInAction(() => {
      this.status = 'awaiting-answer';
      this.message = '';
      this.question = question;
      this.pendingMessages = [...messages];
    });
  }

  cancel(): void {
    this.abortController?.abort();
  }

  /** Routes one tool call. A call with `inputError` runs nothing. `finish`/`ask_user` never touch a document,
   *  so they bypass resolution/`onOpenDocument`/undo groups (ADR 0036: a run with no document must still end). */
  private dispatchToolCall(call: ILlmToolCall, activeDocumentId: string | null): Promise<TToolExecutionResult> {
    if (call.inputError) {
      return Promise.resolve(fail(`${call.inputError}. Nothing was applied — resend the call with complete JSON.`));
    }
    if (call.name === 'finish') return Promise.resolve(executeFinish(call.input));
    if (call.name === 'ask_user') return Promise.resolve(executeAskUser(call.input, this.askOffered));
    if (CORE_TOOL_NAMES.has(call.name)) {
      if (!isCoreToolOffered(this.coreToolAllowlist, call.name))
        return Promise.resolve(fail(`Tool ${call.name} is not available in this run`));
      return this.executeCoreCall(call, activeDocumentId);
    }
    return this.executeProviderCall(call);
  }

  /** Resolves the run's effective active document id (`options.activeDocumentId` ?? `defaultScheme?.id` ?? `null`,
   *  no fail-fast: there may be no document yet, ADR 0036), the question policy, and the system prompt. */
  private prepareRun(options: IAgentRunOptions): {
    activeDocumentId: string | null;
    system: string;
    offerAskUser: boolean;
  } {
    const activeDocumentId = options.activeDocumentId ?? this.defaultScheme?.id ?? null;
    const context = buildRunContext(activeDocumentId, options.focusNodeId, this.documentResolver);
    const policy = resolveQuestionPolicy(options);
    return {
      activeDocumentId,
      offerAskUser: policy.offered,
      system: buildSystemPrompt(context, this.contextProviders, policy, options.systemPrompt),
    };
  }

  /** A built-in node tool: resolves its target `Scheme`, fires `onOpenDocument`, opens that document's undo
   *  group on first touch, focuses-then-pauses on the icon about to change, then applies the call. */
  private async executeCoreCall(call: ILlmToolCall, activeDocumentId: string | null): Promise<TToolExecutionResult> {
    const resolved = resolveTargetScheme(this.documentResolver, call, activeDocumentId);
    if ('error' in resolved) return fail(resolved.error);
    const targetScheme = resolved.scheme;
    this.onOpenDocument?.(targetScheme);
    if (!READ_ONLY_CORE_TOOLS.has(call.name)) ensureGroupOpen(targetScheme, this.openGroups);
    const focusId = getFocusTargetId(call, targetScheme);
    if (focusId) {
      focusNode(targetScheme, focusId);
      if (this.focusPauseMs > 0) await sleep(this.focusPauseMs);
    }

    return executeToolCall(call, targetScheme, { nodeKindFilter: this.nodeKindFilter });
  }

  /** A `toolProviders` tool (ADR 0034 §4): no scheme, focus/pause, undo group or `onOpenDocument`. */
  private executeProviderCall(call: ILlmToolCall): Promise<TToolExecutionResult> {
    const provider = this.toolProviders.find((candidate) => candidate.tools.some((tool) => tool.name === call.name));
    return Promise.resolve(provider ? provider.execute(call) : fail(`Unknown tool: ${call.name}`));
  }
}
