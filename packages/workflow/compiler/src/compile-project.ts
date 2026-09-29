import type { IDebugMap, IDebugTracePoint } from '@falang/debug';
import type { IProjectDocument } from '@falang/dto';
import { registerContainerScopeContributor, registerScopeContributor } from '@falang/typescript-common';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  registerIntegrationScopeContributors,
  registerQuestionScopeContributors,
} from '@falang/workflow-integrations-common';
import {
  buildActivityProxyGroupCode,
  collectActivityProxyEntries,
  groupActivityProxyEntries,
} from './activity-proxy-groups.js';
import { buildChoiceEmitters } from './choice-emitters.js';
import { collectIntegrationActivityCode, compileActivities } from './compile-activities.js';
import type { ICompileError } from './compile-errors.js';
import { ProjectCompileError } from './compile-errors.js';
import { compileFunction } from './compile-function.js';
import {
  compileTriggerFunction,
  findTriggerDescriptor,
  type ITriggerFunctionBodyData,
} from './compile-trigger-function.js';
import { DEBUG_RUNTIME_CODE, DEBUG_RUNTIME_IMPORTS } from './debug-runtime.js';
import { buildIntegrationEmitters } from './integration-emitters.js';
import type { IDebugEmitOptions, TResolveFunctionName } from './node-emitters.js';
import { NodeCompileError } from './node-compile-error.js';
import { POSITION_RUNTIME_CODE, POSITION_RUNTIME_IMPORTS } from './position-runtime.js';
import { buildQuestionEmitters } from './question-emitters.js';
import { selectUsedIntegrations, type IUsedIntegrations } from './used-integrations.js';

export interface ICompileProjectParams {
  /**
   * A project's full document set (see `@falang/dto`'s `IProjectDocument`) — `type === 'function'`
   * and `type === 'trigger-function'` documents are compiled; anything else (e.g. `objects-structure`,
   * the pinned `integrations` document, local type metadata) is skipped.
   */
  readonly documents: readonly IProjectDocument[];
  /**
   * Registered vendor integrations (e.g. Telegram) — see ADR 0006. Defaults to none. Every one is
   * available for resolving nodes/triggers, but only the ones the documents actually use end up in
   * the compiled output (activity code and proxies) — see `selectUsedIntegrations`.
   */
  readonly integrations?: readonly IWorkflowIntegration[];
  /**
   * Instruments every compiled function for live execution-position tracking (the `falang-position`
   * query + position-carrying failures, see `position-runtime.ts` and ADR 0022 (private)). Off by
   * default so preview output (the editor's code viewer) and the emitter-level tests stay clean;
   * `@falang/workflow-backend` turns it on for every real dev and published build.
   */
  readonly trackPosition?: boolean;
  /**
   * Instruments every compiled `function` document (not `trigger-function` — deferred, see
   * ADR 0021 (private)'s Phase 3) for breakpoint debugging (`falang-debug-*`
   * signals/query, see `debug-runtime.ts`) and returns the resulting `IDebugMap` on `debugMap`. Off
   * by default; `@falang/workflow-backend` turns it on for dev builds only — never for published
   * artifacts (see the ADR §5).
   */
  readonly debug?: boolean;
}

/**
 * `logActivity` (used by `log` nodes, see node-emitters.ts) and the activity-backed actions of every
 * vendor the project uses (e.g. `telegramSendMessage`, see `selectUsedIntegrations`; plus
 * `runActivepiecesAction` when an `activepieces-action` node exists) are proxied once at module
 * scope, grouped by their `activityOptions` (see `groupActivityProxyEntries`) — one `proxyLocalActivities`/
 * `proxyActivities` destructuring per group. The default group (no `activityOptions` anywhere) runs as
 * *local* activities — in-process on the same Worker (no task-queue round trip) but still records a
 * `MarkerRecorded` history event, so `log` stays visible in Temporal Web UI — see
 * ADR 0001 (private)'s `log` row; ADR 0038 (private)
 * §3 is why other groups exist at all (streaming/long-running activities need `proxyActivities`,
 * task-queue-routed, instead). `defineSignal`/`setHandler`/`condition` are imported unconditionally
 * alongside `proxyLocalActivities` (unused imports are harmless) rather than only when a
 * `trigger-function` document is present — simpler than conditional generation. `proxyActivities` only
 * joins the import set when at least one group actually needs it. `workflowInfo`, unlike those three,
 * *is* conditional (`hasStartDelivery`) — it's only ever read by a `delivery: 'start'` trigger's
 * compiled preamble (see `compile-trigger-function.ts`), which no project need have at all.
 * `CancellationScope`/`isCancellation` are likewise conditional (`hasCloseableQuestion`) — only a
 * project with at least one `IQuestionDescriptor.closeActivitySignature` node (ADR 0040 (private)
 * §4) needs the cancellation-safe close its `question-emitters.ts` wraps around the wait.
 */
const buildWorkflowPreamble = (
  used: IUsedIntegrations,
  trackPosition: boolean,
  debug: boolean,
  hasStartDelivery: boolean,
  hasCloseableQuestion: boolean,
): string => {
  const groups = groupActivityProxyEntries(
    collectActivityProxyEntries(used.integrations, { includeActivepiecesAction: used.usesActivepiecesAction }),
  );
  const imports = new Set(['condition', 'defineSignal', 'proxyLocalActivities', 'setHandler']);
  if (groups.some((group) => group.options.kind === 'regular')) imports.add('proxyActivities');
  if (hasStartDelivery) imports.add('workflowInfo');
  if (hasCloseableQuestion) {
    imports.add('CancellationScope');
    imports.add('isCancellation');
  }
  if (trackPosition) for (const name of POSITION_RUNTIME_IMPORTS) imports.add(name);
  if (debug) for (const name of DEBUG_RUNTIME_IMPORTS) imports.add(name);
  return [
    `import { ${[...imports].toSorted().join(', ')} } from '@temporalio/workflow';`,
    '',
    groups.map((group) => buildActivityProxyGroupCode(group)).join('\n\n'),
    ...(trackPosition ? ['', POSITION_RUNTIME_CODE] : []),
    ...(debug ? ['', DEBUG_RUNTIME_CODE] : []),
  ].join('\n');
};

export interface ICompiledProject {
  /** The workflow-functions module — one `export async function` per `function` document. */
  readonly workflows: string;
  /** The Activity implementations module (see `compile-activities.ts`), loaded separately by the runner. */
  readonly activities: string;
  /** Only present when `debug: true` — every instrumented statement across every `function` document, in compile order. */
  readonly debugMap?: IDebugMap;
}

/**
 * Compiles every `function` document in a project into two TypeScript modules: the workflow
 * functions themselves, and the Activity implementations they call into (see
 * `compile-activities.ts`) — kept as separate modules because `@falang/workflow-runner`'s
 * `startRunner` registers the latter as the Temporal Worker's `activities` (a plain object of real
 * functions) while the former is only ever referenced by *path* (Temporal's own workflow bundler
 * loads and sandboxes it, see ADR 0002 (private)'s Implementation notes) — the two can't be one
 * file. `call-function` nodes reference other documents by `schemeId`, resolved here against each
 * function document's `id` — so every function ends up defined in the same workflows module and
 * callable by name, with no imports needed. All functions are exported; which one a Temporal
 * Worker runs as a workflow is chosen at execution-start time (`--type <functionName>`), not baked
 * into compilation.
 */
export const compileProject = ({
  documents,
  integrations = [],
  trackPosition = false,
  debug = false,
}: ICompileProjectParams): ICompiledProject => {
  // Same registration `@falang/workflow-scheme`'s `IntegrationsModule` does for the editor
  // (ADR 0039 (private) §3) — needed here too since `node-emitters.ts`'s debug instrumentation
  // (`getScopeContribution`, only reached when `debug: true`) runs on the backend, which never
  // constructs an `IntegrationsModule`. Idempotent by node name, so re-registering on every
  // `compileProject` call is harmless.
  registerIntegrationScopeContributors(integrations, registerScopeContributor);
  // Same rationale, for a question's `answerScope` (ADR 0040 (private) §4) — the editor registers
  // this via `IntegrationsModule.register()`, the backend never runs one.
  registerQuestionScopeContributors(integrations, registerContainerScopeContributor);

  const functionDocuments = documents.filter((document) => document.type === 'function');
  const triggerFunctionDocuments = documents.filter((document) => document.type === TRIGGER_FUNCTION_NAME);
  // Only vendors some compiled document calls into contribute activity code/proxies — an unused
  // integration's code (and its imports) never reaches the artifact the runner loads.
  const used = selectUsedIntegrations([...functionDocuments, ...triggerFunctionDocuments], integrations);

  // Determined up front, before any document is actually compiled, by the same body/trigger lookup
  // `compileTriggerFunction` itself does (`findTriggerDescriptor`) — `buildWorkflowPreamble` needs to
  // know whether to import `workflowInfo` before it ever sees a compiled `'start'`-delivery preamble.
  // A document with no root or an unbound/unknown vendor is silently skipped here; either throws its
  // own error in the compile loop below, same as every other malformed trigger-function.
  const hasStartDeliveryTrigger = triggerFunctionDocuments.some((document) => {
    const [, body] = document.root?.children ?? [];
    if (!body) return false;
    return findTriggerDescriptor(body.data as ITriggerFunctionBodyData, integrations)?.delivery === 'start';
  });
  // Same "determined up front" reasoning as `hasStartDeliveryTrigger` above, for the
  // `CancellationScope`/`isCancellation` imports `question-emitters.ts`'s close-on-cancel wrapper needs.
  const hasCloseableQuestion = used.integrations.some((integration) =>
    (integration.questions ?? []).some((question) => Boolean(question.closeActivitySignature)),
  );

  const namesById = new Map(
    [...functionDocuments, ...triggerFunctionDocuments].map((document) => [document.id, document.name]),
  );
  const resolveFunctionName: TResolveFunctionName = (schemeId) => {
    const name = namesById.get(schemeId);
    if (!name) {
      throw new Error(`call-function references unknown document "${schemeId}"`);
    }
    return name;
  };

  const integrationEmitters = buildIntegrationEmitters(integrations);
  // `questionEmitters`/`choiceEmitters` share the exact same `(node, compile) => string` shape and
  // globally-unique node names (enforced by `NodesStack`) — merged into one map rather than adding a
  // third parameter everywhere `questionEmitters` is threaded through.
  const branchEmitters = { ...buildQuestionEmitters(integrations), ...buildChoiceEmitters(integrations) };

  // Dense, globally-unique across every `function` document in the project (never `trigger-function`
  // — not debuggable in Phase 1, see ADR 0021 (private)), so a breakpoint's `{documentId, nodeId}`
  // resolves to exactly one index regardless of which document it's in.
  let nextTraceIndex = 0;
  const tracePoints: IDebugTracePoint[] = [];
  const allocateTraceIndex = (): number => {
    const index = nextTraceIndex;
    nextTraceIndex += 1;
    return index;
  };
  const buildDebugOptions = (documentId: string): IDebugEmitOptions => ({
    documentId,
    allocateIndex: allocateTraceIndex,
    onTracePoint: (site) => tracePoints.push(site),
  });

  // Each document compiles independently — one broken document shouldn't hide errors in every
  // other one, so a failure here is recorded against its own document and compilation continues,
  // rather than aborting the whole project on the first throw.
  const errors: ICompileError[] = [];
  const blocks: { documentId: string; documentName: string; code: string }[] = [];
  const toCompileError = (document: IProjectDocument, error: unknown): ICompileError => ({
    documentId: document.id,
    documentName: document.name,
    ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
    message: error instanceof Error ? error.message : String(error),
  });

  for (const document of functionDocuments) {
    try {
      if (!document.root) {
        throw new Error(`Function document "${document.id}" has no root node`);
      }
      const code = compileFunction(document.root, document.name, {
        resolveFunctionName,
        integrationEmitters,
        questionEmitters: branchEmitters,
        ...(trackPosition ? { trackPosition: { documentId: document.id } } : {}),
        ...(debug ? { debug: buildDebugOptions(document.id) } : {}),
      });
      blocks.push({ documentId: document.id, documentName: document.name, code });
    } catch (error) {
      errors.push(toCompileError(document, error));
    }
  }

  for (const document of triggerFunctionDocuments) {
    try {
      if (!document.root) {
        throw new Error(`Trigger function document "${document.id}" has no root node`);
      }
      const code = compileTriggerFunction(document.root, document.name, integrations, {
        resolveFunctionName,
        ...(trackPosition ? { trackPosition: { documentId: document.id } } : {}),
      });
      blocks.push({ documentId: document.id, documentName: document.name, code });
    } catch (error) {
      errors.push(toCompileError(document, error));
    }
  }

  // Unused vendors are already filtered out (`used`, above) — see `collectIntegrationActivityCode`.
  const extraActivityCode = collectIntegrationActivityCode(used.integrations);
  const activities = compileActivities(extraActivityCode, {
    includeActivepiecesAction: used.usesActivepiecesAction,
  });

  // Each document's block is wrapped in its own `doc-start`/`doc-end` marker (see
  // `parse-compiled-markers.ts`) before joining, so a diagnostic against the compiled output can
  // always be resolved back to the document that produced it.
  const content = blocks
    .map(
      (block) =>
        `// doc-start:${block.documentName}:${block.documentId}\n${block.code}\n// doc-end:${block.documentName}:${block.documentId}`,
    )
    .join('\n\n');
  // Always assembled, even when `errors` isn't empty — the successfully-compiled blocks still form
  // valid partial output, carried on `ProjectCompileError` below so a caller can show the user their
  // code alongside the errors instead of nothing at all.
  const workflows = `${buildWorkflowPreamble(used, trackPosition, debug, hasStartDeliveryTrigger, hasCloseableQuestion)}\n\n${content}`;

  if (errors.length > 0) {
    throw new ProjectCompileError(errors, workflows, activities);
  }

  return { workflows, activities, ...(debug ? { debugMap: { tracePoints } } : {}) };
};
