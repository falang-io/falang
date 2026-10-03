import type { INode } from '@falang/dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import {
  parseDurationToMs,
  type IQuestionDescriptor,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { indentLines } from './indent.js';
import { resolveFieldExpression } from './integration-emitters.js';
import type { TQuestionEmitters } from './node-emitters.js';
import { buildSwitchCases, type TCompileChildren } from './switch-cases.js';

interface IQuestionOptionData {
  readonly label: string;
  /** Only present when the descriptor sets `optionDataTypes` — see `build-question-node-config.ts`. */
  readonly dataType?: 'void' | 'string' | 'number' | 'boolean';
  /** Set only on the automatic `timeout` option `timeoutField` adds — see `TIMEOUT_CASE_VALUE`. */
  readonly fixed?: boolean;
}

/** `IQuestionDescriptor.askActivitySignature`/`resolveActivitySignature`/`closeActivitySignature` are `'<name>(...): Promise<...>'` — the bare name is everything before the first `(`. */
const parseActivityName = (signature: string): string => signature.slice(0, signature.indexOf('(')).trim();

/** `q_<sanitized node id>` — node ids (nanoid) may start with a digit or contain `-`, neither valid at the start/inside a bare JS identifier without the `q_` prefix/sanitizing. Unique per node instance so multiple question nodes in one compiled function (sequential, or nested in a loop) never collide on variable names. */
const variablePrefix = (node: INode): string => `q_${node.id.replaceAll('-', '_')}`;

/**
 * Discriminant the compiled `switch` uses for the automatic timeout branch (ADR 0040 (private)
 * §4) — never a real option label: `buildQuestionNodeConfig` marks that one option `data.fixed:
 * true` rather than relying on label text, so a user option that happens to be literally titled
 * "timeout" can never collide with it.
 */
const TIMEOUT_CASE_VALUE = "'__timeout__'";

/**
 * Builds the codegen for one `IQuestionDescriptor`: send the question with buttons, block until a
 * matching button-press signal arrives (correlated by the sent message's id, not by signal
 * identity — see `IQuestionDescriptor.answerSignalName`), resolve (strip buttons + confirm), then
 * branch like an ordinary `switch` over the pressed button's label. `defineSignal`/`setHandler`/
 * `condition` need no new imports — `compile-project.ts`'s `buildWorkflowPreamble` already imports
 * them unconditionally for `trigger-function`'s own signal-wait preamble. A descriptor with none of
 * `timeoutField`/`answerScope`/`closeActivitySignature` set (e.g. `telegram-question` before
 * ADR 0040 (private)) emits byte-identical output to before these extensions existed.
 */
const buildQuestionEmitter = (
  descriptor: IQuestionDescriptor,
): ((node: INode, compile: TCompileChildren) => string) => {
  const askFnName = parseActivityName(descriptor.askActivitySignature);
  const resolveFnName = parseActivityName(descriptor.resolveActivitySignature);
  const closeFnName = descriptor.closeActivitySignature && parseActivityName(descriptor.closeActivitySignature);
  const fieldsByName = new Map(
    [...descriptor.contextFields, ...descriptor.questionFields].map((field) => [field.name, field]),
  );
  const payloadType = descriptor.answerScope
    ? '{ messageId: string; value: string; data?: unknown; resolvedBy?: string; resolvedAt?: string }'
    : '{ messageId: string; value: string }';

  return (node, compile) => {
    const data = (node.data ?? {}) as Readonly<Record<string, string>> & { options?: readonly string[] };
    const resolveField = (name: string): string => {
      const field = fieldsByName.get(name);
      if (!field) throw new Error(`Question node "${node.id}" has no declared field "${name}"`);
      const resolved = resolveFieldExpression(field, data[name] ?? '');
      // An `'expression'`-kind field left blank (e.g. `human-task`'s optional `payload`/`attachments`,
      // ADR 0040 (private) §1) would otherwise splice an empty argument slot into the compiled call
      // (`asExpression('') === ''`), a guaranteed syntax error — every other field kind already
      // produces valid syntax when empty (`template-string` wraps in backticks; `text`/`select`/
      // `credential-ref` are `JSON.stringify`'d; `result-type`/`new-variable` are passed through raw
      // but are never left blank in practice). No existing question field is both `'expression'`-kind
      // and ever left blank in a test fixture, so this doesn't change any existing compiled output.
      return field.kind === 'expression' && resolved === '' ? 'undefined' : resolved;
    };
    // `timeoutField` (when set) names one of `contextFields`/`questionFields`, so it's rendered by
    // the sidebar like any other field and its raw value flows through the node's ordinary `data` —
    // but it's never an actual activity argument (`askActivitySignature`/`resolveActivitySignature`
    // /`closeActivitySignature` all predate it), so it's excluded here rather than resolved into an
    // arg like every other field.
    const isTimeoutField = (field: { readonly name: string }): boolean => field.name === descriptor.timeoutField;
    const contextArgs = descriptor.contextFields
      .filter((field) => !isTimeoutField(field))
      .map((field) => resolveField(field.name));
    const questionArgs = descriptor.questionFields
      .filter((field) => !isTimeoutField(field))
      .map((field) => resolveField(field.name));
    const prefix = variablePrefix(node);
    const children = node.children ?? [];
    // `data.options` (bare labels, kept in sync with `children` by the sidebar editor — see
    // `build-question-node-config.ts`'s own doc comment) is what every pre-`optionDataTypes`
    // descriptor (e.g. `telegram-question`) still sends the ask activity — unchanged. A descriptor
    // with `optionDataTypes` (`human-task`) needs its ask activity to know each option's `dataType`/
    // `prompt` too (the backend's task row stores them, see ADR 0040 (private) §1/§2), which only
    // the option *children*'s own `data` carries — the header's `data.options` array never gained a
    // richer shape, since `telegram-question` still only wants labels. The fixed, non-deletable
    // timeout option (`data.fixed`, added by `buildQuestionNodeConfig` for a `timeoutField`
    // descriptor) is excluded — it isn't a real button and was never in `data.options` either.
    const optionsForAsk: readonly unknown[] = descriptor.optionDataTypes
      ? children.filter((option) => !(option.data as IQuestionOptionData).fixed).map((option) => option.data)
      : (data.options ?? []);

    // Structural presence of `timeoutField` on the descriptor adds the automatic option/close-on-
    // expiry machinery; an empty value on THIS node means "no timeout for this instance" (today's
    // plain `condition()`-forever behavior) — see `IQuestionDescriptorExtensions.timeoutField`'s doc.
    const timeoutValue = descriptor.timeoutField ? (data[descriptor.timeoutField] ?? '').trim() : '';
    const hasTimeout = timeoutValue !== '';

    const getCaseValue = (option: INode): string => {
      const optionData = option.data as IQuestionOptionData;
      return optionData.fixed ? TIMEOUT_CASE_VALUE : JSON.stringify(optionData.label);
    };
    // Always a real function (never conditionally `undefined`) so `buildSwitchCases`'s own
    // `buildCasePrefix?.(option)` call never has to distinguish "no prefix at all" from "this
    // particular option gets no prefix" — both just return nothing.
    const buildCasePrefix = (option: INode): string | undefined => {
      if (!descriptor.answerScope?.perOptionData) return;
      const optionData = option.data as IQuestionOptionData;
      if (optionData.fixed || !optionData.dataType || optionData.dataType === 'void') return;
      // `${prefix}Payload` is declared `PayloadType | undefined` (only ever assigned inside the
      // signal handler) — by the time a real (non-timeout) option's branch runs, a payload has
      // definitely arrived, but the declared type doesn't know that; `!` asserts it for the
      // strict-mode typecheck (ADR 0040 (private)'s `typeCheckProject`), same as `${prefix}Answer!`'s
      // own declaration above.
      return `const data = ${prefix}Payload!.data as ${optionData.dataType};`;
    };
    // Without a timeout value there is no timeout case at all — a leftover `fixed` branch (kept in the
    // tree by the editor only because it still has content, so it isn't deleted silently) is skipped
    // rather than compiled into an unreachable `case '__timeout__'`.
    const caseOptions = hasTimeout
      ? children
      : children.filter((option) => !(option.data as IQuestionOptionData).fixed);
    const cases = buildSwitchCases(caseOptions, compile, getCaseValue, buildCasePrefix);

    // `descriptor.optionDataTypes` (`human-task`) declares `askActivitySignature`'s `options` param
    // as a plain `string` (the activity itself `JSON.parse`s it — see `tasks.integration.ts`), unlike
    // every other descriptor (e.g. `telegram-question`), whose `options: readonly string[]` wants the
    // JSON array spliced in as a real JS array-literal expression. A single `JSON.stringify` gives the
    // right shape for the latter but produces a bare array literal for the former — not assignable to
    // `string` — so this branch needs a *string-literal* expression whose value is that same JSON text,
    // i.e. `JSON.stringify` applied twice (the inner call also correctly escapes any quotes/newlines
    // in a `label`/`prompt` when it's re-embedded as a string literal's contents).
    const askOptionsArg = descriptor.optionDataTypes
      ? JSON.stringify(JSON.stringify(optionsForAsk))
      : JSON.stringify(optionsForAsk);
    const askArgs = [...contextArgs, ...questionArgs, askOptionsArg].join(', ');
    const resolveArgs = [...contextArgs, `${prefix}MessageId`, `${prefix}Answer`].join(', ');
    const closeArgs = (reason: "'expired'" | "'cancelled'"): string =>
      [...contextArgs, `${prefix}MessageId`, reason].join(', ');

    const lines: string[] = [
      `const ${prefix}MessageId = (await ${askFnName}(${askArgs})).messageId;`,
      `let ${prefix}HasAnswer = false;`,
      `let ${prefix}Answer!: string;`,
      // Declared here (not `const … = await condition(...)` inline in `waitLines`) since, with
      // `closeFnName` set, that wait is wrapped in a `try { … }` — a `const` declared inside would go
      // out of scope before `afterWaitLines`' own `if (${prefix}Answered)`/`switch` read it, which is
      // exactly the bug this comment is here to warn against reintroducing.
      ...(hasTimeout ? [`let ${prefix}Answered = false;`] : []),
      ...(descriptor.answerScope ? [`let ${prefix}Payload: ${payloadType} | undefined;`] : []),
      `setHandler(defineSignal<[${payloadType}]>('${descriptor.answerSignalName}'), (payload) => {`,
      `  if (payload.messageId === ${prefix}MessageId) {`,
      `    ${prefix}Answer = payload.value;`,
      ...(descriptor.answerScope ? [`    ${prefix}Payload = payload;`] : []),
      `    ${prefix}HasAnswer = true;`,
      '  }',
      '});',
    ];

    const waitLines: string[] = [];
    if (hasTimeout) {
      const timeoutMs = parseDurationToMs(timeoutValue);
      waitLines.push(`${prefix}Answered = await condition(() => ${prefix}HasAnswer, ${timeoutMs});`);
      if (closeFnName) {
        waitLines.push(`if (!${prefix}Answered) {`, `  await ${closeFnName}(${closeArgs("'expired'")});`, '}');
      }
    } else {
      waitLines.push(`await condition(() => ${prefix}HasAnswer);`);
    }
    // A cancelled workflow (Stop, or a dev pod's executions killed by a new build, see
    // ADR 0040 (private) §5) surfaces as a thrown `CancelledFailure` from whatever `await` it was
    // blocked on — `finally`-style cleanup is `CancellationScope.nonCancellable`, since an ordinary
    // await inside a `catch` triggered by cancellation would itself be immediately cancelled too.
    const waitBlock = closeFnName
      ? [
          'try {',
          indentLines(waitLines.join('\n')),
          '} catch (e) {',
          '  if (isCancellation(e)) {',
          `    await CancellationScope.nonCancellable(() => ${closeFnName}(${closeArgs("'cancelled'")}));`,
          '  }',
          '  throw e;',
          '}',
        ].join('\n')
      : waitLines.join('\n');

    const afterWaitLines: string[] = [];
    if (hasTimeout) {
      afterWaitLines.push(`if (${prefix}Answered) {`, `  await ${resolveFnName}(${resolveArgs});`, '}');
    } else {
      afterWaitLines.push(`await ${resolveFnName}(${resolveArgs});`);
    }
    if (descriptor.answerScope) {
      const { variableName, type } = descriptor.answerScope;
      afterWaitLines.push(
        `const ${variableName}: ${variableInfoToTsType(type)} = { id: ${prefix}MessageId, resolvedBy: String(${prefix}Payload?.resolvedBy ?? ''), resolvedAt: String(${prefix}Payload?.resolvedAt ?? '') };`,
      );
    }
    const switchDiscriminant = hasTimeout
      ? `${prefix}Answered ? ${prefix}Answer : ${TIMEOUT_CASE_VALUE}`
      : `${prefix}Answer`;
    afterWaitLines.push(`switch (${switchDiscriminant}) {\n${indentLines(cases)}\n}`);

    return [...lines, waitBlock, ...afterWaitLines].join('\n');
  };
};

/** One recursive emitter per registered vendor's question node kind — see `IQuestionDescriptor`. */
export const buildQuestionEmitters = (integrations: readonly IWorkflowIntegration[]): TQuestionEmitters => {
  const emitters: TQuestionEmitters = {};
  for (const integration of integrations) {
    for (const question of integration.questions ?? []) {
      emitters[question.name] = buildQuestionEmitter(question);
    }
  }
  return emitters;
};
