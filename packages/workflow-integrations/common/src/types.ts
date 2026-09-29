import type { TVariableInfo } from '@falang/typescript-dto';
import type { TRegisterIntegrationBackend } from './backend-runtime.js';
import type { IFieldOptionsContext } from './field-options-context.js';
import type { IIntegrationInstance } from './integrations-document.js';
import type { IOAuth2Config } from './oauth2-config.js';
import type { IQuestionDescriptorExtensions } from './question-extensions.js';

export type {
  IQuestionDescriptorExtensions,
  IQuestionOptionDataWithType,
  TTaskOptionDataType,
} from './question-extensions.js';
export { taskOptionDataTypeToVariableInfo } from './question-extensions.js';

/**
 * 'text'/'expression'/'template-string'/'select'/'credential-ref' are all stored as plain strings in node `data`.
 * 'expression' gets Monaco/hidden-scope typing in the editor — an unconstrained TS expression by default, or forced
 * to type-check against `IFieldConfig.expectedType` when set (hidden `let _value: T =` prefix), same mechanism as
 * `@falang/typescript-scheme`'s `arr-op-input`/`arr-insert`. 'template-string' is a plain string that may contain
 * `${expr}` interpolation — edited via `@falang/typescript-scheme`'s `TemplateStringStore` (hidden backtick wrap, so
 * the user never types the surrounding quotes) and viewed via `TemplateStringViewComponent`, same as the `log`
 * block's message field. 'secret' only appears in `IWorkflowIntegration.credentialFields`, never in an action's
 * `fields` — actions reference a credential by id via a 'credential-ref' field, never hold the secret. 'select' is
 * also a plain string (the chosen option's value) — its options can be declared statically (`IFieldConfig.options`)
 * or fetched live from the vendor (`IFieldConfig.loadOptions`), see there. 'result-type' is stored as a JSON-encoded,
 * restricted `TVariableInfo` (`{type:'string'}` or `{type:'struct',id}`) so it still fits the generic
 * `Record<string,string>` node data shape. 'new-variable' declares a fresh identifier (validated for TS
 * syntax/uniqueness, see `@falang/typescript-scheme`'s `NewVariableStore`) that the action's result is assigned to
 * — e.g. `call-ai-text`'s `resultVariable` — and becomes visible to later sibling nodes' scope (see
 * `@falang/typescript-common`'s `getScopeContribution`).
 */
export type TIntegrationFieldKind =
  | 'text'
  | 'expression'
  | 'template-string'
  | 'select'
  | 'secret'
  | 'credential-ref'
  | 'result-type'
  | 'new-variable';

export interface IFieldSelectOption {
  readonly value: string;
  readonly label: string;
}

/** Per-activity Temporal registration/retry options — absent means today's behavior (a local activity, `startToCloseTimeout: '10 seconds'`, SDK-default retry); `buildWorkflowPreamble` groups activities sharing the same options tuple into one `proxyLocalActivities`/`proxyActivities` block. `heartbeatTimeout` is only meaningful for an activity that heartbeats via `Context.current().heartbeat()`. */
export interface IActivityOptions {
  /** `'local'` (default) is `proxyLocalActivities`; `'regular'` is task-queue-routed `proxyActivities` — needed once an activity streams data or runs longer than a local activity should. */
  readonly kind?: 'local' | 'regular';
  /** Temporal duration string, e.g. `'10 minutes'` (default `'10 seconds'`). */
  readonly startToCloseTimeout?: string;
  readonly heartbeatTimeout?: string;
  readonly retry?: { readonly maximumAttempts?: number; readonly nonRetryableErrorTypes?: readonly string[] };
}

export interface IFieldConfig {
  readonly name: string;
  readonly label: string;
  readonly kind: TIntegrationFieldKind;
  /** Only meaningful for `kind: 'select'`, when the option list doesn't depend on the credential — mutually exclusive with `loadOptions`. */
  readonly options?: readonly IFieldSelectOption[];
  /** Only meaningful for `kind: 'select'`, when the option list must be fetched from the vendor (e.g. `call-ai-text`'s `model`) — backend-only, `credentialFields` already resolved (`dev` env), see `@falang/workflow-backend`'s field-options endpoint; mutually exclusive with `options`. `ctx` (ADR 0039 (private) §6) carries previously-synced vendor data, e.g. `sql-common`'s `table` field. */
  readonly loadOptions?: (
    credentialFields: Readonly<Record<string, string>>,
    ctx?: IFieldOptionsContext,
  ) => Promise<readonly IFieldSelectOption[]>;
  /** Only meaningful for `kind: 'credential-ref'` — restricts to this vendor's instances. */
  readonly vendor?: string;
  /**
   * Only meaningful for `kind: 'expression'`. When set, the editor forces the field to type-check
   * against this type (hidden `let _value: T =` prefix) instead of only the bare enclosing scope —
   * same mechanism `@falang/typescript-scheme`'s `arr-op-input`/`arr-insert` use for their typed fields.
   *
   * May instead be a function of the action's *other* current field values — for a generic
   * "call vendor API" action where one `select` field picks a method and a sibling `expression`
   * field's shape depends on which one (e.g. a Wildberries/Ozon/МойСклад method-dispatch node's
   * `data` field, typed against whichever `IIntegrationStructType` the chosen `method` maps to).
   * `IntegrationActionEditorStore` re-invokes this on every field-value change and re-derives the
   * field's hidden prefix (`CodeModelStore.setHiddenPrefix`) — cheap since an action has only a
   * handful of fields. Returning `undefined` (e.g. no method chosen yet) falls back to the bare
   * enclosing scope, same as leaving `expectedType` unset entirely.
   */
  readonly expectedType?: TVariableInfo | ((fields: Readonly<Record<string, string>>) => TVariableInfo | undefined);
  /** Only meaningful for `kind: 'secret'`: normally both `dev`/`prod` are required (see `IntegrationsEditor`); set this to let `prod` be left empty, falling back to `dev` at resolve time (`@falang/workflow-backend`'s `resolveFieldValue`) — useful when a single key is shared across envs. */
  readonly secretProdOptional?: boolean;
  /** Only meaningful for monaco-backed kinds (`'expression'`/`'template-string'`) inside a sidebar editor layout (`IActionDescriptor.editorType === 'sidebar'`, or a question/choice header field) — the compact inline table layout ignores this flag. `'small'` starts one line tall and grows; `'big'` (default) is a fixed tall box. E.g. Telegram's `telegram-question` `chatId`. */
  readonly fieldSize?: 'small' | 'big';
  /** Set on a credential field the backend itself writes (e.g. an OAuth2 token/expiry) rather than the user typing it — `IntegrationsEditor` skips rendering an input for it, but the field still flows through the normal `credentialFields` pipeline unchanged. See ADR 0015 (private). */
  readonly hidden?: boolean;
  /** Validates the field's current value up front (error message, or `undefined` when it's fine) — used by `NewTriggerModal` for `contextFields` so a bad value (e.g. a malformed cron expression) is caught at creation time, not later at reconcile time. */
  readonly validate?: (value: string) => string | undefined;
}

/**
 * A trigger's payload shape is fixed by the vendor, not user-editable — see ADR 0006's
 * `trigger-function` section. `signalName` is what `gateway`'s `signalWithStart` call and the
 * compiled workflow's `condition()` wait both key off; the same signal also backs later
 * `<vendor>-wait-message`-style nodes for multi-turn flows. `scopeVariableName` is the fixed
 * identifier the compiled `trigger-function` binds the signal payload to (e.g. `message`) — see
 * `@falang/workflow-compiler`'s `compileTriggerFunction`.
 */
export interface ITriggerDescriptor {
  readonly name: string;
  readonly label: string;
  readonly scopeType: TVariableInfo;
  readonly scopeVariableName: string;
  readonly signalName: string;
  readonly webhookPath: string;
  /**
   * A plain-English description of this trigger for an LLM choosing between it and a sibling one —
   * same idea and same "plain English, not translated, LLM-only" posture as `@falang/mcp-core`'s
   * `NODE_KIND_NOTES` (see ADR 0009 (private)'s 2026-09-22 note), applied to
   * triggers instead of node kinds. **Required**, not optional: `label` is UI-display text — often an
   * `I18NStore` translation key (see `IWorkflowIntegration.locales`) meaningless outside the UI — so
   * every agent-facing catalog (`DocumentToolProvider`'s `list_trigger_vendors`/`search_triggers`, ADR
   * 0034; `mcp-workflow-tools.ts`'s `list_integrations`, ADR 0029) surfaces `notes` instead of `label`
   * and needs it to always be real text, not sometimes-absent. A vendor with no `locales` (its `label`
   * is already literal text, e.g. Bitrix24/ЮKassa) can start from that same string here as a stopgap —
   * real per-trigger translation work is still expected eventually (see
   * ADR 0034 (private)'s "third real chat" note), this field just can't wait on it.
   */
  readonly notes: string;
  /**
   * Extra fields the user fills in once, up front, in "New trigger" (e.g. Telegram's on-command
   * trigger's `command` name) — fixed at creation time and denormalized onto `trigger-function-body`'s
   * `triggerConfig` (see `@falang/workflow-dto`'s `trigger-function-nodes.ts`), the same way
   * `scopeVariableName`/`scopeType` already are. A trigger config value is always a plain string, so
   * only `kind: 'text'`/`'select'` is supported here. Absent for triggers with no extra config.
   */
  readonly contextFields?: readonly IFieldConfig[];
  /** How the payload reaches the compiled workflow — `'signal'` (default, today's `defineSignal`/`condition()` shape) or `'start'` for a trigger that can only ever *start* a workflow, never signal one (e.g. a Temporal Schedule): the payload is then the compiled function's first argument, no signal/wait. */
  readonly delivery?: 'signal' | 'start';
}

export interface IActionDescriptor {
  readonly name: string;
  readonly label: string;
  /** Which editor widget this action's node opens in — see `@falang/scheme`'s `EditorType.configurable`. Default `'inline'`. */
  readonly editorType?: 'inline' | 'sidebar';
  readonly fields: readonly IFieldConfig[];
  /** Compiler codegen for the call site — `fields` maps field name to its compiled expression/identifier. */
  readonly emit: (fields: Readonly<Record<string, string>>) => string;
  /** Verbatim TS emitted into `activities.ts`, alongside every other registered integration's — see ADR 0001/0006. */
  readonly activityCode: string;
  /**
   * The `proxyLocalActivities<{...}>()` type-literal member for this action's activity, e.g.
   * `'telegramSendMessage(credentialId: string, chatId: number, text: string): Promise<void>'` — the
   * leading identifier up to `(` must match both `activityCode`'s exported function name and whatever
   * `emit()`'s generated call site invokes. See `@falang/workflow-compiler`'s `compile-project.ts`,
   * which parses the bare name out of this for the proxy's destructuring.
   */
  readonly activitySignature: string;
  /** Temporal registration/retry options for this action's activity — see `IActivityOptions`. Absent = today's local-activity/10s/SDK-default behavior. */
  readonly activityOptions?: IActivityOptions;
  /** Type of the variable declared by this action's `kind: 'new-variable'` field (e.g. `call-ai-text`'s `resultVariable`) — same signature as `IFieldConfig.expectedType`. Absent means that variable is typed `any`. */
  readonly resultType?: TVariableInfo | ((fields: Readonly<Record<string, string>>) => TVariableInfo | undefined);
}

/**
 * A named struct type a vendor's triggers/actions reference by id (e.g. a trigger's `scopeType`
 * being `{ type: 'struct', id }`) — seeded into the editor's `TypesRegistryStore` (see
 * `@falang/workflow-scheme`'s `IntegrationsModule`) so Monaco can resolve/autocomplete it exactly
 * like a user-authored `objects-structure` struct, no separate mechanism needed.
 */
export interface IIntegrationStructType {
  readonly id: string;
  readonly name: string;
  readonly properties: Readonly<Record<string, TVariableInfo>>;
}

/**
 * Describes a "chat-vendor interactive question" node: ask a question with a fixed set of button
 * choices, block until the user picks one, then branch — modeled on the `switch` node (header +
 * one `<name>-option` child per choice, each an ordinary branch). Doesn't fit `IActionDescriptor`
 * (a leaf node, single `emit()` call, no children) so it's its own descriptor category. See
 * `@falang/workflow-compiler`'s `question-emitters.ts` for the codegen this drives and
 * `@falang/workflow-scheme`'s `blocks/integration-question/` for the sidebar editor.
 */
export interface IQuestionDescriptor extends IQuestionDescriptorExtensions {
  readonly name: string;
  readonly label: string;
  /**
   * Fields passed to BOTH the ask and resolve activities, in this order, e.g. `credentialId`/`chatId`
   * — "who/where to ask" rather than "what to ask". Split from `questionFields` so the compiler knows
   * exactly which header fields the resolve call needs, without the resolve activity having to accept
   * (and ignore) ask-only fields like the question text itself.
   */
  readonly contextFields: readonly IFieldConfig[];
  /** Fields passed to the ask activity ONLY, after `contextFields`, e.g. the question text. */
  readonly questionFields: readonly IFieldConfig[];
  /** One signal shared by every node of this kind in a compiled workflow — button presses are correlated to a specific pending question by `messageId`, not by signal identity. */
  readonly answerSignalName: string;
  /** Sends the question with inline buttons and returns an id identifying the sent message, e.g. `'telegramAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>'`. */
  readonly askActivitySignature: string;
  readonly askActivityCode: string;
  /** Strips the buttons from the asked message and sends the "you picked X" confirmation, e.g. `'telegramResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>'`. */
  readonly resolveActivitySignature: string;
  readonly resolveActivityCode: string;
  /** Temporal registration/retry options applied to both the ask and resolve activities of this question — see `IActivityOptions`. Absent = today's local-activity/10s/SDK-default behavior. */
  readonly activityOptions?: IActivityOptions;
}

/**
 * Describes an "AI structured choice" node: ask an AI model to pick one of several named options
 * and return typed data alongside the pick — `{ action: Alias1, data: TData1 } | { action: Alias2,
 * data: TData2 } | ...` — then branch on `action`, with `data` in scope (correctly typed) inside
 * each branch. Same header+`<name>-option` shape as `IQuestionDescriptor` (modeled on `switch`), but
 * a single synchronous call rather than a signal-wait — no "ask"/"resolve" split needed. See
 * `@falang/workflow-compiler`'s `choice-emitters.ts` for the codegen and
 * `@falang/workflow-scheme`'s `blocks/integration-choice/` for the sidebar editor.
 *
 * Each option's `dataType` is restricted to scalar `TVariableInfo` (`string`/`number`/`boolean`) —
 * `struct` would require the compiler to resolve project struct definitions into JSON Schema, a
 * capability that doesn't exist yet anywhere in the compiler (the same gap `call-ai-text`'s
 * `result`-type field already hits). `choice-emitters.ts` throws a clear compile-time error if a
 * non-scalar `dataType` reaches it, rather than silently emitting something wrong.
 */
export interface IChoiceDescriptor {
  readonly name: string;
  readonly label: string;
  /** Fields passed to the activity, "who/where to ask" — e.g. credential-ref + model. */
  readonly contextFields: readonly IFieldConfig[];
  /** Fields passed to the activity after `contextFields`, "what to ask" — e.g. the prompt. */
  readonly promptFields: readonly IFieldConfig[];
  /**
   * One synchronous call — no signal/wait, unlike `IQuestionDescriptor`. Its last parameter receives
   * the JSON Schema `choice-emitters.ts` builds from this node's options (an inline object literal
   * in the compiled call site, not a runtime `JSON.parse`), e.g.
   * `'callAiChoice(credentialId: string, model: string, prompt: string, schema: unknown): Promise<{ action: string; data: unknown }>'`.
   */
  readonly activitySignature: string;
  readonly activityCode: string;
  /** Temporal registration/retry options for this choice's activity — see `IActivityOptions`. Absent = today's local-activity/10s/SDK-default behavior. */
  readonly activityOptions?: IActivityOptions;
}

export interface IWorkflowIntegration {
  readonly vendor: string;
  readonly label: string;
  /**
   * Required plain-English description of what this vendor is and what it's used for — the text the
   * in-app agent's `search_integrations` keyword-matches against and shows (ADR 0034 (private)'s
   * 2026-09-27 "token budget" note), same "LLM-only, never translated" contract as
   * `ITriggerDescriptor.notes`. Write it keyword-rich: product name(s), category words a user might say
   * (e.g. "AI", "LLM", "chat bot", "CRM", "marketplace", "payments"), and the main things it can do.
   */
  readonly notes: string;
  readonly credentialFields: readonly IFieldConfig[];
  /** Present when this vendor authenticates via OAuth2 — drives `IntegrationsEditor`'s "Connect" button. */
  readonly oauth2?: IOAuth2Config;
  readonly triggers: readonly ITriggerDescriptor[];
  readonly actions: readonly IActionDescriptor[];
  /** Interactive question-with-buttons node kinds this vendor offers — see `IQuestionDescriptor`. */
  readonly questions?: readonly IQuestionDescriptor[];
  /** AI structured-choice node kinds this vendor offers — see `IChoiceDescriptor`. */
  readonly choices?: readonly IChoiceDescriptor[];
  /** Struct types this vendor's descriptors reference (e.g. Telegram's incoming message shape). */
  readonly types?: readonly IIntegrationStructType[];
  /**
   * Verbatim TS emitted into `activities.ts` exactly once for this vendor, ahead of every
   * `actions`/`questions`/`choices` activity code — for helpers (e.g. a credential-resolving
   * function) shared across more than one of this vendor's activities, so they don't each redeclare
   * it (which would collide, since `compileActivities` concatenates every vendor's code into one
   * module).
   */
  readonly sharedActivityCode?: string;
  /**
   * Drives this vendor's inbound ingress (webhook and/or polling) for every configured credential
   * instance — see `backend-runtime.ts`'s `TRegisterIntegrationBackend`. Absent for vendors with no
   * triggers (e.g. OpenAI-compatible, which is action-only).
   */
  readonly registerBackend?: TRegisterIntegrationBackend;
  /** "Sync structure" (ADR 0039 (private) §4) — connects with resolved (always **dev**) credential fields, returns data to persist per key via `IntegrationVendorDataService.set` (read back through `instanceTypes` below/`GET .../vendor-data`); `env` is unused by every v1 (SQL) implementer. */
  readonly syncVendorData?: (
    credentialFields: Readonly<Record<string, string>>,
    env: 'dev' | 'prod',
  ) => Promise<Record<string, Record<string, unknown>>>;
  /** Struct types derived from one instance's synced vendor data (ADR 0039 (private) §5, e.g. one struct per synced table), registered under a `db:<instanceId>` parent — `[]` (not a throw) when nothing is synced yet. */
  readonly instanceTypes?: (
    instance: IIntegrationInstance,
    vendorData: Readonly<Record<string, Record<string, unknown>>>,
  ) => readonly IIntegrationStructType[];
  /**
   * Dynamically-loaded translations for this vendor's `label`/`field.label`/etc. strings — same
   * shape/contract as `@falang/scheme`'s `I18NStore.register()` (structurally compatible on
   * purpose, not type-imported, so this package stays free of a UI-package dependency; see ADR
   * 0008). `IntegrationsModule` (`@falang/workflow-scheme`) forwards this to `I18NStore.register()`
   * keyed by `` `integration:${vendor}` ``. A vendor with no `locales` just keeps rendering its
   * literal `label` strings as-is — `t()` returns an unrecognized key unchanged (see ADR 0008),
   * so migrating a vendor to real translation keys is opt-in and incremental, not all-or-nothing.
   */
  readonly locales?: Partial<Record<string, TIntegrationLocaleLoader>>;
}

/** `{ [namespace]: { [key]: string } }`, loaded lazily per-language — see `IWorkflowIntegration.locales`. */
export type TIntegrationLocaleLoader = () => Promise<{ default: Record<string, Record<string, unknown>> }>;
