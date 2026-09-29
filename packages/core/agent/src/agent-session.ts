import { makeObservable, observable, runInAction } from 'mobx';
import type { HistoryStore, Scheme } from '@falang/scheme';
import { focusNode, TOKEN_HISTORY } from '@falang/scheme';
import { resolveService } from '@falang/di';
import type { ILlmClient, ILlmToolCall, ILlmToolResult, TLlmMessage } from './llm-client.js';
import type { IAgentContextProvider, IAgentRunContext } from './context-provider.js';
import type { IAgentDocumentResolver } from './document-resolver.js';
import { createHomeOnlyDocumentResolver } from './document-resolver.js';
import { getFocusTargetId } from './focus-target.js';
import { AGENT_TOOLS } from './tools.js';
import type { IAgentToolProvider } from './tool-provider.js';
import type { TToolExecutionResult } from './tool-executor.js';
import { executeFinish, executeToolCall } from './tool-executor.js';
import { fail } from './tool-result.js';
import { supersedeEarlierToolResults } from './supersede-tool-results.js';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import {
  addUsage,
  buildSystemPrompt,
  EMPTY_USAGE,
  DEFAULT_MAX_STEPS,
  FOCUS_PAUSE_MS,
  getDocumentIdInput,
  getFinishMessage,
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

export type TAgentStatus = 'idle' | 'running' | 'done' | 'error';

export class AgentSession {
  @observable status: TAgentStatus = 'idle';
  @observable.ref steps: readonly IAgentStep[] = [];
  @observable.ref usage: IAgentUsageTotal = EMPTY_USAGE;
  @observable message = '';
  @observable error = '';
  /** The raw thrown value behind `error` (in-memory only, never persisted) — lets a host render a typed failure, e.g. a 402. */
  @observable.ref rawError: unknown = null;

  /** The session's single-scheme fallback (ADR 0036) — used as both the default target for a
   *  documentId-less/activeDocumentId-less call (via the default `documentResolver`) and as the fallback
   *  for `IAgentRunOptions.activeDocumentId` when a run doesn't pass one explicitly. `null` for a host
   *  that always passes `activeDocumentId` (and, when needed, a real `documentResolver`) explicitly —
   *  e.g. one `AgentSession` shared across a whole project, with no one scheme of its own. */
  private readonly defaultScheme: Scheme | null;
  private readonly client: ILlmClient;
  private readonly contextProviders: readonly IAgentContextProvider[];
  private readonly documentResolver: IAgentDocumentResolver;
  private readonly onOpenDocument?: (scheme: Scheme) => void;
  private readonly onRunFinished?: () => void;
  private readonly toolProviders: readonly IAgentToolProvider[];
  private readonly nodeKindFilter?: IAgentNodeKindFilter;
  private abortController: AbortController | null = null;

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
    makeObservable(this);
  }

  async run(request: string, options: IAgentRunOptions = {}): Promise<void> {
    if (this.status === 'running') throw new Error('AgentSession: already running');

    const { activeDocumentId, system } = this.prepareRun(options);

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
    });

    const messages: TLlmMessage[] = [...(options.priorMessages ?? []), { content: request, role: 'user' }];
    // One undo group per document touched during this run (ADR 0034) — opened lazily on first touch,
    // closed for every document in `finally` below, regardless of how the run ends.
    const openGroups = new Map<Scheme, HistoryStore>();
    const tools = [...AGENT_TOOLS, ...this.toolProviders.flatMap((provider) => provider.tools)];

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

        const newSteps: IAgentStep[] = [];
        const results: ILlmToolResult[] = [];
        let finishMessage: string | null = null;

        for (const call of response.toolCalls) {
          // oxlint-disable-next-line no-await-in-loop
          const result = await this.dispatchToolCall(call, activeDocumentId, openGroups);
          newSteps.push({ call, result });
          results.push({
            content: result.ok ? result.content : result.error,
            isError: !result.ok,
            toolCallId: call.id,
          });
          const finished = getFinishMessage(call, result);
          if (finished !== null) finishMessage = finished;
        }

        runInAction(() => {
          this.steps = [...this.steps, ...newSteps];
        });
        messages.push({ results, role: 'tool' });
        supersedeEarlierToolResults(messages, activeDocumentId);

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
      for (const history of openGroups.values()) history.endGroup();
      this.abortController = null;
      this.onRunFinished?.();
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  /** Routes one tool call to its handler. A call whose arguments the client couldn't parse (`inputError`)
   *  runs nothing and gets that error back. `finish` never touches a document, so it's resolved directly,
   *  bypassing the document-resolution/`onOpenDocument`/undo-group dance every other core tool goes
   *  through (ADR 0036: a run with no active document at all must still be able to finish). */
  private dispatchToolCall(
    call: ILlmToolCall,
    activeDocumentId: string | null,
    openGroups: Map<Scheme, HistoryStore>,
  ): Promise<TToolExecutionResult> {
    if (call.inputError) {
      return Promise.resolve(fail(`${call.inputError}. Nothing was applied — resend the call with complete JSON.`));
    }
    if (call.name === 'finish') return Promise.resolve(executeFinish(call.input));
    if (CORE_TOOL_NAMES.has(call.name)) return this.executeCoreCall(call, activeDocumentId, openGroups);
    return this.executeProviderCall(call);
  }

  /** The fail-fast half of `run()`, split out to keep that method's own cyclomatic complexity down —
   *  resolves the run's effective active document id (`options.activeDocumentId` ?? `defaultScheme?.id`
   *  ?? `null` — no fail-fast check: there may be no document yet, ADR 0036) and builds the system prompt
   *  around it. Unlike before ADR 0036, this no longer checks any scheme's `HistoryModule` or resolves a
   *  root node up front — both happen lazily, per document, on that document's first touch inside the run
   *  loop instead. */
  private prepareRun(options: IAgentRunOptions): { activeDocumentId: string | null; system: string } {
    const activeDocumentId = options.activeDocumentId ?? this.defaultScheme?.id ?? null;
    const context: IAgentRunContext = {
      activeDocumentId,
      getActiveScheme: () => {
        if (activeDocumentId === null) return null;
        try {
          return this.documentResolver.resolve(activeDocumentId);
        } catch {
          return null;
        }
      },
    };
    return { activeDocumentId, system: buildSystemPrompt(context, this.contextProviders) };
  }

  /** One of the built-in node tools — resolves its target `Scheme` (`documentResolver.resolve`, called
   *  with the call's own `documentId` when given or the run's effective active document id otherwise;
   *  `fail()` without calling the resolver at all when neither exists), fires `onOpenDocument` for the
   *  successfully-resolved target (every call, not just non-active/first-touch ones — see that option's
   *  own doc comment), opens that document's undo group on first touch, focuses-then-pauses on the icon
   *  about to change, then applies it. */
  private async executeCoreCall(
    call: ILlmToolCall,
    activeDocumentId: string | null,
    openGroups: Map<Scheme, HistoryStore>,
  ): Promise<TToolExecutionResult> {
    const resolved = this.resolveTargetScheme(call, activeDocumentId);
    if ('error' in resolved) return fail(resolved.error);
    const targetScheme = resolved.scheme;
    this.onOpenDocument?.(targetScheme);
    this.ensureGroupOpen(targetScheme, openGroups);

    const focusId = getFocusTargetId(call, targetScheme);
    if (focusId) {
      focusNode(targetScheme, focusId);
      await sleep(FOCUS_PAUSE_MS);
    }

    return executeToolCall(call, targetScheme, { nodeKindFilter: this.nodeKindFilter });
  }

  /** A call's `documentId` when given, otherwise the run's effective active document id — either way
   *  passed through `documentResolver.resolve` (ADR 0036 dropped the old "omitted documentId never calls
   *  the resolver" special case: an omitted id now resolves the same way an explicit one does, just using
   *  the active id as the argument). No effective active id and no explicit `documentId` either → `fail()`
   *  before ever calling the resolver. A resolver throw (unknown/non-editable id) becomes `{ error }`
   *  instead of propagating — the LLM's mistake to recover from, same as any other invalid call. */
  private resolveTargetScheme(
    call: ILlmToolCall,
    activeDocumentId: string | null,
  ): { scheme: Scheme } | { error: string } {
    const targetId = getDocumentIdInput(call) ?? activeDocumentId;
    if (targetId === null) return { error: 'documentId is required — no document is open in the editor' };
    try {
      return { scheme: this.documentResolver.resolve(targetId) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** A tool from one of `toolProviders` (ADR 0034 §4) — no scheme, no focus/pause, no undo group, and
   *  never fires `onOpenDocument` (there is no target `Scheme` to open a tab for). */
  private executeProviderCall(call: ILlmToolCall): Promise<TToolExecutionResult> {
    const provider = this.toolProviders.find((candidate) => candidate.tools.some((tool) => tool.name === call.name));
    if (!provider) return Promise.resolve({ error: `Unknown tool: ${call.name}`, ok: false });
    return Promise.resolve(provider.execute(call));
  }

  /** Opens (once) the undo group for `targetScheme` on first touch this run — throws if that scheme
   *  has no `HistoryModule` registered, same fatal-to-the-run treatment as ADR 0034 always gave a
   *  non-home document with no `HistoryModule`. */
  private ensureGroupOpen(targetScheme: Scheme, openGroups: Map<Scheme, HistoryStore>): void {
    if (openGroups.has(targetScheme)) return;
    const targetHistory = this.resolveHistory(targetScheme);
    targetHistory.beginGroup();
    openGroups.set(targetScheme, targetHistory);
  }

  private resolveHistory(targetScheme: Scheme): HistoryStore {
    try {
      return resolveService(TOKEN_HISTORY, targetScheme.container);
    } catch {
      throw new Error('AgentModule requires HistoryModule to be registered');
    }
  }
}
