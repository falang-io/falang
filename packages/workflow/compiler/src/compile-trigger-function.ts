import type { INode } from '@falang/dto';
import { variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import type { ITriggerDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { buildChoiceEmitters } from './choice-emitters.js';
import {
  wrapBodyWithDebugTracking,
  wrapBodyWithPositionTracking,
  type ITrackPositionOptions,
} from './compile-function.js';
import { getContainerScopeContribution } from '@falang/typescript-common';
import { JOURNAL_FN } from './journal-runtime.js';
import { indentLines } from './indent.js';
import { buildIntegrationEmitters } from './integration-emitters.js';
import { compileStatements, type IDebugEmitOptions, type TResolveFunctionName } from './node-emitters.js';
import { NodeCompileError } from './node-compile-error.js';
import { asComment, asStatement } from './raw-code.js';
import { buildQuestionEmitters } from './question-emitters.js';

export interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly returnValue?: TVariableInfo;
}

/**
 * Resolves a `trigger-function-body`'s bound vendor/trigger pair (`bodyData.vendor`/`triggerName`)
 * against `integrations` — the same lookup `compileTriggerFunction` needs to compile a document's
 * body, factored out so `compile-project.ts`'s `buildWorkflowPreamble` can also ask, up front and
 * per document, whether a project has any `delivery: 'start'` trigger at all (it needs to know that
 * before compiling any document, to decide whether `workflowInfo` belongs in the shared
 * `@temporalio/workflow` import line). Returns `undefined` for an unbound/unknown vendor or trigger
 * name — `compileTriggerFunction` itself turns that into a thrown `NodeCompileError`.
 */
export const findTriggerDescriptor = (
  bodyData: ITriggerFunctionBodyData,
  integrations: readonly IWorkflowIntegration[],
): ITriggerDescriptor | undefined =>
  integrations
    .find((integration) => integration.vendor === bodyData.vendor)
    ?.triggers.find((candidate) => candidate.name === bodyData.triggerName);

export interface ICompileTriggerFunctionOptions {
  /** Resolves `call-function` targets to compiled function names; see `compileProject`. */
  readonly resolveFunctionName?: TResolveFunctionName;
  /** Instruments the body for live execution-position tracking — see `position-runtime.ts`. Off unless set. */
  readonly trackPosition?: ITrackPositionOptions;
  /** Instruments the body for breakpoint debugging — see `debug-runtime.ts`. Off unless set. */
  readonly debug?: IDebugEmitOptions;
}

/**
 * Compiles a `trigger-function` document (see `@falang/workflow-dto`'s `trigger-function-nodes.ts`)
 * into a Temporal workflow entry point — see ADR 0006's "trigger-function" and "Runtime dialog
 * continuation" sections, and ADR 0037 §3 for the `delivery: 'start'` shape below.
 *
 * The bound trigger's `delivery` (default `'signal'`) picks one of two shapes:
 *
 * - `'signal'` — every execution starts the same way regardless of whether it's the first message or
 *   a conversation continuation (`gateway`'s `signalWithStart` handles that distinction, not this
 *   code): register a signal handler for the trigger's `signalName`, wait for the first signal via
 *   `condition()`, bind the payload to the trigger's fixed `scopeVariableName`, then run the body's
 *   statements.
 * - `'start'` — for a trigger that can only ever *start* a workflow, never signal one (e.g. a
 *   Temporal Schedule, which can only call `startWorkflow`): the payload is the compiled function's
 *   first (and only) argument, no signal handler/wait. Since a Schedule's `action.args` are static and
 *   can't carry the real fire time, the compiled preamble always overwrites the trigger's own
 *   `scheduledAt` field with the actual value read from Temporal's `TemporalScheduledStartTime`
 *   search attribute (falling back to `new Date()` when it's absent — e.g. a manual "Run now" start
 *   with no Schedule behind it at all) before binding the trigger's `scopeVariableName`.
 *
 * `integrations` must include the vendor `trigger-function-body`'s data is bound to (matched by
 * `vendor`/`triggerName`) or this throws — a `trigger-function` document referencing an unregistered
 * vendor can't compile, the same way `call-function` can't compile against an unresolvable `schemeId`.
 */
export const compileTriggerFunction = (
  triggerFunctionNode: INode,
  name: string,
  integrations: readonly IWorkflowIntegration[],
  options: ICompileTriggerFunctionOptions = {},
): string => {
  const [header, body, footer] = triggerFunctionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      triggerFunctionNode.id,
      `Trigger function node "${triggerFunctionNode.id}" is missing its trigger-function-body child`,
    );
  }

  const bodyData = body.data as ITriggerFunctionBodyData;
  const trigger = findTriggerDescriptor(bodyData, integrations);
  if (!trigger) {
    throw new NodeCompileError(
      triggerFunctionNode.id,
      `Trigger function node "${triggerFunctionNode.id}" is bound to unknown trigger "${bodyData.vendor}/${bodyData.triggerName}" — is that vendor registered?`,
    );
  }

  const payloadType = variableInfoToTsType(trigger.scopeType);
  const returnType = bodyData.returnValue ? variableInfoToTsType(bodyData.returnValue) : 'void';
  const signalConstName = `${name}Signal`;
  const isStartDelivery = trigger.delivery === 'start';

  // Run journal (ADR 0059 (private) §2a): the payload that started this run, right after it is bound —
  // a mandatory entry the scheme author never draws. `journalMessage` is the vendor's readable line (a
  // template-literal body over the scope variable), else the trigger's name.
  const journalMessage = trigger.journalMessage ?? JSON.stringify(trigger.name).slice(1, -1);
  const triggerJournal = `${JOURNAL_FN}({ kind: 'trigger', level: 'info', message: \`${journalMessage}\`, data: { payload: ${trigger.scopeVariableName} } });`;

  const preamble = isStartDelivery
    ? [
        `const __falangScheduledStart = workflowInfo().searchAttributes['TemporalScheduledStartTime']?.[0] as Date | undefined;`,
        `const ${trigger.scopeVariableName}: ${payloadType} = { ...payload, scheduledAt: (__falangScheduledStart ?? new Date()).toISOString() };`,
        triggerJournal,
      ].join('\n')
    : [
        `const ${signalConstName} = defineSignal<[${payloadType}]>('${trigger.signalName}');`,
        '',
        `let ${trigger.scopeVariableName}!: ${payloadType};`,
        'let hasSignal = false;',
        `setHandler(${signalConstName}, (payload: ${payloadType}) => {`,
        `  ${trigger.scopeVariableName} = payload;`,
        '  hasSignal = true;',
        '});',
        'await condition(() => hasSignal);',
        triggerJournal,
      ].join('\n');

  const headerComment = asComment(header?.data as string | undefined);
  const integrationEmitters = buildIntegrationEmitters(integrations);
  // `questionEmitters`/`choiceEmitters` share the exact same shape and globally-unique node names —
  // merged into one map, see `compile-project.ts`'s `branchEmitters`.
  const branchEmitters = { ...buildQuestionEmitters(integrations), ...buildChoiceEmitters(integrations) };
  const statements = compileStatements(
    body.children ?? [],
    options.resolveFunctionName,
    integrationEmitters,
    branchEmitters,
    Boolean(options.trackPosition),
    options.debug,
    // The trigger's payload variable (declared by the preamble above) is in scope for every statement.
    options.debug ? getContainerScopeContribution(body) : [],
  );
  const footerCode = asStatement(footer?.data as string | undefined);

  // The signal wait (when present — `'start'` delivery has none) is inside the tracked region too,
  // so a triggered execution still parked on its first signal reports its document with a `null`
  // node — "started, nothing ran yet".
  const plainBody = [preamble, statements, footerCode].filter((line) => line !== '').join('\n');
  const positionWrappedBody = options.trackPosition
    ? wrapBodyWithPositionTracking(plainBody, options.trackPosition)
    : plainBody;
  const bodyCode = options.debug ? wrapBodyWithDebugTracking(positionWrappedBody) : positionWrappedBody;
  const params = isStartDelivery ? `payload: ${payloadType}` : '';
  const declaration = `export async function ${name}(${params}): Promise<${returnType}> {\n${indentLines(bodyCode)}\n}`;
  return headerComment === '' ? declaration : `${headerComment}\n${declaration}`;
};
