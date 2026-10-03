import type { HistoryStore, Scheme } from '@falang/scheme';
import { TOKEN_HISTORY } from '@falang/scheme';
import { resolveService } from '@falang/di';
import type { IAgentContextProvider, IAgentRunContext } from './context-provider.js';
import type { IAgentDocumentResolver } from './document-resolver.js';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import type { ILlmToolCall, ILlmUsage, TLlmMessage } from './llm-client.js';
import type { IAgentToolProvider } from './tool-provider.js';
import type { TToolExecutionResult } from './tool-executor.js';
import type { IQuestionPolicy } from './ask-user.js';
import { buildAskUserPrompt } from './ask-user.js';

/** `AgentSession.run`'s options — split out here (from `agent-session.ts`, re-exported from there
 *  unchanged) purely to keep that file's own line count under this repo's `max-lines` oxlint budget; no
 *  behavior split, same pattern as this file's own system-prompt/finish-message helpers below. */
export interface IAgentRunOptions {
  /** Defaults to `DEFAULT_MAX_STEPS` (40) — see that constant's own doc comment. */
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
  /** Prior turns of this conversation, prepended before the new user message so the LLM keeps context across
   *  separate `run()` calls — `run()` itself stays stateless/one-shot otherwise (see class doc). */
  readonly priorMessages?: readonly TLlmMessage[];
  /** The document open in the editor when this run starts (ADR 0036 — "no home document"), if it's one the
   *  agent can edit — `null`/omitted means none is open. Used to build the system prompt's "currently open"
   *  line and as the default target for a tool call whose `documentId` is omitted. Defaults to
   *  `defaultScheme?.id ?? null` when omitted. Captured once at the start of `run()` and held for the whole
   *  run — nothing about a host's "active document" changing mid-run (e.g. because `onOpenDocument` opened
   *  a new tab) can retarget an already-running turn. */
  readonly activeDocumentId?: string | null;
  /** The node this run is about (ADR 0046); captured once at `run()` start and exposed to context providers
   *  as `IAgentRunContext.focusNodeId`. */
  readonly focusNodeId?: string;
  /** A host-supplied system prompt (ADR 0046). Replaces the default base text (the "you edit a project…"
   *  intro, the code-fields paragraph and the "currently open document" line); still appended after it, exactly
   *  as for the default prompt: the `ask_user` rules (when `ask_user` is offered) and every context provider's
   *  `describe` output. */
  readonly systemPrompt?: string;
  /** Offer the `ask_user` tool (ADR 0047). Defaults to true; false also tells the prompt to decide alone. */
  readonly allowQuestions?: boolean;
  /** Defaults to `DEFAULT_MAX_CONSECUTIVE_QUESTIONS`. */
  readonly maxConsecutiveQuestions?: number;
  /** How many questions in a row preceded this run (counted by the host). Defaults to 0. */
  readonly consecutiveQuestions?: number;
}

/** `AgentSession`'s constructor `extra` options — see `IAgentRunOptions`'s own doc comment on why this
 *  lives here rather than in `agent-session.ts`. */
export interface IAgentSessionExtraOptions {
  /** Turns a tool call's `documentId` into the `Scheme` to run it against (ADR 0034). Defaults to a
   *  resolver that always returns `defaultScheme` — today's single-document behavior. */
  readonly documentResolver?: IAgentDocumentResolver;
  /** Called before every core (node) tool call is applied, right after its target document has resolved
   *  successfully — the host's cue to make sure that document has an open tab (ADR 0036's "Opening a
   *  document the agent touches" amendment). Hosts implement it as "ensure open": if the target document
   *  already has a tab, do nothing (never steals the user's active tab mid-run); if it doesn't, open one
   *  and make it active. Fires for *every* target, including the run's own active document — not just
   *  "first touch" and not just for a non-active one. Never fires for a call whose target failed to
   *  resolve (a `fail()` tool result instead), and never for a `toolProviders` call (ADR 0034 §4), which
   *  has no target `Scheme` at all. */
  readonly onOpenDocument?: (scheme: Scheme) => void;
  /** Called once `run()` settles (done, error, or cancel) — the host's cue to release anything it
   *  acquired for the duration of this run, e.g. a document lock taken out in `documentResolver` (ADR
   *  0034 §2.4). Fires after every open undo group has already been closed. */
  readonly onRunFinished?: () => void;
  /** Extra tools alongside `AGENT_TOOLS` (ADR 0034 §4) — a call to one of these skips the focus/pause/
   *  undo-group treatment the 10 built-in node tools get, since a provider's tool doesn't necessarily
   *  touch any one `Scheme` directly. */
  readonly toolProviders?: readonly IAgentToolProvider[];
  /** Trims what `get_node_kinds` lists (never what insertion accepts) — see `IAgentNodeKindFilter`. */
  readonly nodeKindFilter?: IAgentNodeKindFilter;
  /** Allowlist over `AGENT_TOOLS` names (ADR 0046): when set, only these core tools are offered; `finish` is
   *  always kept, `ask_user` stays governed by `allowQuestions`, provider tools are unaffected. A call to a
   *  filtered-out core tool runs nothing and gets an error result. */
  readonly coreTools?: readonly string[];
  /** How long to pause after focusing the icon about to change, before a mutating core call is applied (a UI
   *  nicety so a human watches the edit land). Defaults to `FOCUS_PAUSE_MS` (300); `0` skips the sleep entirely
   *  — headless hosts (the agent tuner) pass it. */
  readonly focusPauseMs?: number;
}

/**
 * Raised (from 20) after a real user chat hit it well short of building a non-trivial multi-document
 * workflow (2 trigger-functions, `pseudo-cycle`/`call-ai-choice`/`telegram-question` nesting) — a good
 * chunk of a run's steps are read-only discovery (`get_tree`/`get_node_kinds`/`list_*`), not just
 * mutations, so the real "useful work" budget was smaller than 20 already suggests. Still just a
 * default: `IAgentRunOptions.maxSteps` overrides it per call. Note this doesn't by itself fix a
 * separate, still-unconfirmed suspicion (see ADR 0034 (private)'s "second real chat run" section) —
 * every step's tool results (`get_node_kinds` especially, whose JSON Schema payload is large and
 * mostly unchanged call to call) stay in `messages` for the rest of the run with no pruning, so a
 * longer run also means a larger request on every remaining step; a run that fails from accumulated
 * context size will just fail a few steps later, not stop failing.
 */
export const DEFAULT_MAX_STEPS = 40;

export const FOCUS_PAUSE_MS = 300;

/**
 * ADR 0036 ("no home document"): the system prompt no longer embeds the node-kinds catalog or any tree
 * up front — an empty project has neither, and even a non-empty one might have several documents, only
 * one of which (at most) is "the" open one. The LLM is expected to call `get_tree`/`get_node_kinds` with
 * an explicit `documentId` itself once it knows which document it's working on.
 */
export const buildSystemPrompt = (
  context: IAgentRunContext,
  contextProviders: readonly IAgentContextProvider[],
  questionPolicy?: IQuestionPolicy,
  systemPromptOverride?: string,
): string => {
  const extraContext = contextProviders.map((provider) => provider.describe(context)).filter(Boolean);
  const activeLine =
    context.activeDocumentId === null
      ? 'No document is open in the editor.'
      : `The user currently has document ${context.activeDocumentId} open in the editor — "this document"/"here" means it.`;
  const sections =
    typeof systemPromptOverride === 'string'
      ? [systemPromptOverride]
      : [
          'You edit a project made of documents, each a tree of typed nodes, by calling the provided tools, one ' +
            'action per call. Before editing a document, call get_tree and get_node_kinds with its documentId if ' +
            'you are not sure what is already in it or which node kinds/data shapes are valid at a given point in ' +
            'its tree. Finish every run by calling the `finish` tool with a direct, first-person reply to the ' +
            'user — the message they will read in the chat, not a report about what you did.',
          'Fields on a node that hold code — expressions, conditions, action bodies — are real TypeScript ' +
            'source, not the literal text an end user will see. Message-text fields (a `data` string whose schema ' +
            'description says it is template text, e.g. a chat message) are different: they are the *body* of a ' +
            'template literal whose backticks are added automatically — `Done in ${count} steps` is stored ' +
            "without any backticks or quotes around it, and `${count}` is substituted with that variable's value " +
            "at runtime, it does not print literally. Don't read either kind as plain display text — judge the " +
            '`${...}` parts as TypeScript, and only flag a wording issue for the literal characters outside of ' +
            "any `${...}`. Always check a string field's schema `description` (from get_node_kinds) to know " +
            'which kind it is before writing it.',
          activeLine,
        ];
  if (questionPolicy) sections.push(buildAskUserPrompt(questionPolicy));
  if (extraContext.length > 0) sections.push(extraContext.join('\n'));
  return sections.join('\n\n');
};

export const getFinishMessage = (call: ILlmToolCall, result: TToolExecutionResult): string | null => {
  if (call.name !== 'finish' || !result.ok) return null;
  const parsed = JSON.parse(result.content) as { message: string };
  return parsed.message;
};

export const getDocumentIdInput = (call: ILlmToolCall): string | null => {
  const input = call.input as Record<string, unknown> | null;
  return input && typeof input.documentId === 'string' ? input.documentId : null;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Tokens accumulated over one `run()`; `calls` counts LLM calls that reported usage. */
export interface IAgentUsageTotal {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly calls: number;
}

export const EMPTY_USAGE: IAgentUsageTotal = { calls: 0, completionTokens: 0, promptTokens: 0, totalTokens: 0 };

export const addUsage = (total: IAgentUsageTotal, usage: ILlmUsage): IAgentUsageTotal => ({
  calls: total.calls + 1,
  completionTokens: total.completionTokens + usage.completionTokens,
  promptTokens: total.promptTokens + usage.promptTokens,
  totalTokens: total.totalTokens + usage.totalTokens,
});

/** A call's `documentId` when given, otherwise the run's effective active document id — either way passed
 *  through `resolver.resolve` (ADR 0036). No id at all → `{ error }` before calling the resolver. A resolver
 *  throw (unknown/non-editable id) becomes `{ error }` too — the LLM's mistake to recover from. */
export const resolveTargetScheme = (
  resolver: IAgentDocumentResolver,
  call: ILlmToolCall,
  activeDocumentId: string | null,
): { scheme: Scheme } | { error: string } => {
  const targetId = getDocumentIdInput(call) ?? activeDocumentId;
  if (targetId === null) return { error: 'documentId is required — no document is open in the editor' };
  try {
    return { scheme: resolver.resolve(targetId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

const resolveHistory = (targetScheme: Scheme): HistoryStore => {
  try {
    return resolveService(TOKEN_HISTORY, targetScheme.container);
  } catch {
    throw new Error('AgentModule requires HistoryModule to be registered');
  }
};

/** Opens (once) the undo group for `targetScheme` on first touch this run — throws if that scheme has no
 *  `HistoryModule` registered (fatal to the run, as ADR 0034 always treated it). */
export const ensureGroupOpen = (targetScheme: Scheme, openGroups: Map<Scheme, HistoryStore>): void => {
  if (openGroups.has(targetScheme)) return;
  const history = resolveHistory(targetScheme);
  history.beginGroup();
  openGroups.set(targetScheme, history);
};

/** Whether a core tool is offered under a `coreTools` allowlist (`null` = no allowlist); `finish` always is. */
export const isCoreToolOffered = (allowlist: ReadonlySet<string> | null, name: string): boolean =>
  name === 'finish' || allowlist === null || allowlist.has(name);

/** The `IAgentRunContext` handed to context providers: `activeDocumentId`/`focusNodeId` captured at run start,
 *  and a lazy, uncached resolution of the active document (a resolver throw yields `null`). */
export const buildRunContext = (
  activeDocumentId: string | null,
  focusNodeId: string | undefined,
  resolver: IAgentDocumentResolver,
): IAgentRunContext => ({
  activeDocumentId,
  focusNodeId,
  getActiveScheme: () => {
    if (activeDocumentId === null) return null;
    try {
      return resolver.resolve(activeDocumentId);
    } catch {
      return null;
    }
  },
});
