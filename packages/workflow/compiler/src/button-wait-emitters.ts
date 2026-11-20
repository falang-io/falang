import type { INode } from '@falang/dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import {
  BUTTON_WAIT_PRESSED_LABEL,
  parseDurationToMs,
  type IQuestionDescriptor,
} from '@falang/workflow-integrations-common';
import { indentLines } from './indent.js';
import { resolveFieldExpression } from './integration-emitters.js';
import { JOURNAL_FN } from './journal-runtime.js';
import { NodeCompileError } from './node-compile-error.js';
import { buildSwitchCases, type TCompileChildren } from './switch-cases.js';

const TIMEOUT_CASE_VALUE = "'__timeout__'";
const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const variablePrefix = (node: INode): string => `q_${node.id.replaceAll('-', '_')}`;
const activityName = (signature: string): string => signature.slice(0, signature.indexOf('(')).trim();

const parseTimeout = (node: INode, raw: string): number => {
  const value = raw.trim();
  if (!value) throw new NodeCompileError(node.id, 'The button wait has no timeout — set how long to wait, e.g. "10m"');
  try {
    return parseDurationToMs(value);
  } catch (error) {
    throw new NodeCompileError(node.id, error instanceof Error ? error.message : String(error));
  }
};

/** Send + wait codegen for `<vendor>-ask-buttons`; dynamic buttons have one generic `pressed` branch, not per-button cases. */
export const buildButtonWaitEmitter = (
  descriptor: IQuestionDescriptor,
): ((node: INode, compile: TCompileChildren) => string) => {
  const buttonWait = descriptor.buttonWait;
  const resolveSignature = descriptor.resolveActivitySignature;
  const closeSignature = descriptor.closeActivitySignature;
  if (!buttonWait || !resolveSignature || !closeSignature || !descriptor.timeoutField) {
    throw new Error(`Button wait "${descriptor.name}" needs buttonWait, resolve/close activities and a timeout`);
  }
  const fields = new Map(
    [...descriptor.contextFields, ...descriptor.questionFields].map((field) => [field.name, field]),
  );
  const askFn = activityName(descriptor.askActivitySignature);
  const resolveFn = activityName(resolveSignature);
  const closeFn = activityName(closeSignature);
  const answerType = variableInfoToTsType(buttonWait.answerType);
  const timeoutField = descriptor.timeoutField;

  return (node, compile) => {
    const data = (node.data ?? {}) as Readonly<Record<string, string>>;
    const answerName = (data[buttonWait.answerVariableField] ?? '').trim();
    if (!IDENTIFIER_RE.test(answerName)) {
      throw new NodeCompileError(node.id, `Invalid answer variable name "${answerName}"`);
    }
    const timeoutMs = parseTimeout(node, data[timeoutField] ?? '');
    const resolveField = (name: string): string => {
      const field = fields.get(name);
      if (!field) throw new Error(`Button wait node "${node.id}" has no declared field "${name}"`);
      const resolved = resolveFieldExpression(field, data[name] ?? '');
      return field.kind === 'expression' && resolved === '' ? 'undefined' : resolved;
    };
    const contextArgs = descriptor.contextFields.map((field) => resolveField(field.name));
    const questionArgs = descriptor.questionFields
      .filter((field) => ![timeoutField, 'buttons', buttonWait.answerVariableField].includes(field.name))
      .map((field) => resolveField(field.name));
    const prefix = variablePrefix(node);
    const buttonsExpression = resolveField('buttons');
    const askArgs = [...contextArgs, ...questionArgs, `${prefix}Buttons`, String(timeoutMs)].join(', ');
    const resolveArgs = [...contextArgs, `${prefix}MessageId`, `${prefix}PressedButton!.text`].join(', ');
    const closeArgs = (reason: "'expired'" | "'cancelled'"): string =>
      [...contextArgs, `${prefix}MessageId`, `${prefix}WaitId`, reason].join(', ');
    const payloadType = '{ waitId: string; buttonIndex: number; userId: number }';

    const children = [...(node.children ?? [])];
    for (let index = 0; index < children.length; index += 1) {
      const option = children[index];
      const optionData = option.data as { label?: string } | undefined;
      if (optionData?.label === BUTTON_WAIT_PRESSED_LABEL) {
        children[index] = { ...option, data: { ...optionData, variable: answerName } };
      }
    }
    const cases = buildSwitchCases(
      children,
      compile,
      (option) =>
        (option.data as { label?: string } | undefined)?.label === BUTTON_WAIT_PRESSED_LABEL
          ? JSON.stringify(BUTTON_WAIT_PRESSED_LABEL)
          : TIMEOUT_CASE_VALUE,
      (option) => {
        if ((option.data as { label?: string } | undefined)?.label !== BUTTON_WAIT_PRESSED_LABEL) return;
        return `const ${answerName}: ${answerType} = { value: ${prefix}PressedButton!.value, text: ${prefix}PressedButton!.text, index: ${prefix}Payload!.buttonIndex, userId: ${prefix}Payload!.userId, messageId: ${prefix}MessageId };`;
      },
    );

    return [
      `const ${prefix}Buttons = ${buttonsExpression};`,
      `const ${prefix}Pending = await ${askFn}(${askArgs});`,
      `const ${prefix}MessageId = ${prefix}Pending.messageId;`,
      `const ${prefix}WaitId = ${prefix}Pending.waitId;`,
      `let ${prefix}Payload: ${payloadType} | undefined;`,
      `let ${prefix}Answered = false;`,
      `setHandler(defineSignal<[${payloadType}]>('${descriptor.answerSignalName}'), (payload) => {`,
      `  if (${prefix}Payload === undefined && payload.waitId === ${prefix}WaitId && ${prefix}Buttons[payload.buttonIndex]?.kind === 'command') {`,
      `    ${prefix}Payload = payload;`,
      '  } else {',
      `    ${JOURNAL_FN}({ kind: 'error', level: 'warn', message: 'Ignored input: it does not match the pending button wait', data: { payload } });`,
      '  }',
      '});',
      'try {',
      indentLines(
        [
          `${prefix}Answered = await condition(() => ${prefix}Payload !== undefined, ${timeoutMs});`,
          `if (!${prefix}Answered) {`,
          `  await ${closeFn}(${closeArgs("'expired'")});`,
          '}',
        ].join('\n'),
      ),
      '} catch (e) {',
      '  if (isCancellation(e)) {',
      `    await CancellationScope.nonCancellable(() => ${closeFn}(${closeArgs("'cancelled'")}));`,
      '  }',
      '  throw e;',
      '}',
      `const ${prefix}PressedButton = ${prefix}Answered ? ${prefix}Buttons[${prefix}Payload!.buttonIndex] : undefined;`,
      `if (${prefix}Answered) {`,
      `  ${JOURNAL_FN}({ kind: 'user-input', level: 'info', message: \`Answer: \${${prefix}PressedButton!.text}\`, data: { value: ${prefix}PressedButton!.value, buttonIndex: ${prefix}Payload!.buttonIndex, userId: ${prefix}Payload!.userId } });`,
      `  await ${resolveFn}(${resolveArgs});`,
      '} else {',
      `  ${JOURNAL_FN}({ kind: 'user-input', level: 'warn', message: 'No answer: timed out', data: { timeout: true } });`,
      '}',
      `switch (${prefix}Answered ? ${JSON.stringify(BUTTON_WAIT_PRESSED_LABEL)} : ${TIMEOUT_CASE_VALUE}) {`,
      indentLines(cases),
      '}',
    ].join('\n');
  };
};
