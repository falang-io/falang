import type { INode } from '@falang/dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import {
  parseDurationToMs,
  REPLY_WAIT_MESSAGE_LABEL,
  type IQuestionDescriptor,
} from '@falang/workflow-integrations-common';
import { indentLines } from './indent.js';
import { resolveFieldExpression } from './integration-emitters.js';
import { JOURNAL_FN } from './journal-runtime.js';
import { NodeCompileError } from './node-compile-error.js';
import { buildSwitchCases, type TCompileChildren } from './switch-cases.js';

/** `'<name>(...): Promise<...>'` -> `<name>`. */
const parseActivityName = (signature: string): string => signature.slice(0, signature.indexOf('(')).trim();

/** The `switch` value of the timeout branch — never a label a user could type (both branches are fixed anyway). */
const TIMEOUT_CASE_VALUE = "'__timeout__'";

/** Same `q_<node id>` prefix as the question emitter, so a wait and a question in one function never collide. */
const variablePrefix = (node: INode): string => `q_${node.id.replaceAll('-', '_')}`;

/** The node's timeout in ms, or a compile error on the node. */
const parseNodeTimeout = (node: INode, text: string): number => {
  try {
    return parseDurationToMs(text);
  } catch (error) {
    throw new NodeCompileError(node.id, error instanceof Error ? error.message : String(error));
  }
};

/**
 * Codegen of a reply wait (`IQuestionDescriptorExtensions.replyWait`, ADR 0079 (private)): register the wait with
 * the backend (the ask activity, its result's `messageId` is the wait id), take the first `{ waitId, message }`
 * signal carrying that id, wait at most the node's timeout (mandatory — empty or invalid is a compile error), release
 * the wait on timeout and, in a non-cancellable scope, on cancellation, journal the outcome, then `switch` into the
 * `message` branch (with the reply bound) or the `timeout` branch. `defineSignal`/`setHandler`/`condition`/
 * `CancellationScope`/`isCancellation` are already imported by `compile-project.ts` for a descriptor with a close
 * activity.
 */
export const buildReplyWaitEmitter = (
  descriptor: IQuestionDescriptor,
): ((node: INode, compile: TCompileChildren) => string) => {
  const replyWait = descriptor.replyWait;
  const closeSignature = descriptor.closeActivitySignature;
  if (!replyWait || !closeSignature || !descriptor.timeoutField) {
    throw new Error(`Reply wait "${descriptor.name}" needs replyWait, closeActivitySignature and timeoutField`);
  }
  const timeoutField = descriptor.timeoutField;
  const askFnName = parseActivityName(descriptor.askActivitySignature);
  const closeFnName = parseActivityName(closeSignature);
  const messageType = variableInfoToTsType(replyWait.messageType);
  const payloadType = `{ waitId: string; message: ${messageType} }`;

  return (node, compile) => {
    const data = (node.data ?? {}) as Readonly<Record<string, string>>;
    const resolveArg = (field: (typeof descriptor.contextFields)[number]): string => {
      const resolved = resolveFieldExpression(field, data[field.name] ?? '');
      return field.kind === 'expression' && resolved === '' ? 'undefined' : resolved;
    };
    const timeoutText = (data[timeoutField] ?? '').trim();
    if (timeoutText === '') {
      throw new NodeCompileError(node.id, 'The wait has no timeout — set how long to wait, e.g. "10m"');
    }
    const timeoutMs = parseNodeTimeout(node, timeoutText);

    const contextArgs = descriptor.contextFields.map((field) => resolveArg(field));
    const askArgs = [
      ...contextArgs,
      ...descriptor.questionFields.filter((field) => field.name !== timeoutField).map((field) => resolveArg(field)),
      String(timeoutMs),
    ].join(', ');
    const prefix = variablePrefix(node);
    const closeArgs = (reason: "'expired'" | "'cancelled'"): string =>
      [...contextArgs, `${prefix}WaitId`, reason].join(', ');

    const isMessageBranch = (option: INode): boolean =>
      (option.data as { label?: string } | undefined)?.label === REPLY_WAIT_MESSAGE_LABEL;
    const cases = buildSwitchCases(
      node.children ?? [],
      compile,
      (option) => (isMessageBranch(option) ? JSON.stringify(REPLY_WAIT_MESSAGE_LABEL) : TIMEOUT_CASE_VALUE),
      (option) => {
        if (isMessageBranch(option)) return `const ${replyWait.variableName} = ${prefix}Payload!.message;`;
      },
    );

    return [
      `const ${prefix}WaitId = (await ${askFnName}(${askArgs})).messageId;`,
      `let ${prefix}Payload: ${payloadType} | undefined;`,
      `let ${prefix}Answered = false;`,
      `setHandler(defineSignal<[${payloadType}]>('${descriptor.answerSignalName}'), (payload) => {`,
      `  if (${prefix}Payload === undefined && payload.waitId === ${prefix}WaitId) {`,
      `    ${prefix}Payload = payload;`,
      '  } else {',
      `    ${JOURNAL_FN}({ kind: 'error', level: 'warn', message: 'Ignored input: it does not match the pending wait', data: { payload } });`,
      '  }',
      '});',
      'try {',
      indentLines(
        [
          `${prefix}Answered = await condition(() => ${prefix}Payload !== undefined, ${timeoutMs});`,
          `if (!${prefix}Answered) {`,
          `  await ${closeFnName}(${closeArgs("'expired'")});`,
          '}',
        ].join('\n'),
      ),
      '} catch (e) {',
      '  if (isCancellation(e)) {',
      `    await CancellationScope.nonCancellable(() => ${closeFnName}(${closeArgs("'cancelled'")}));`,
      '  }',
      '  throw e;',
      '}',
      `if (${prefix}Answered) {`,
      `  ${JOURNAL_FN}({ kind: 'user-input', level: 'info', message: \`Message: \${${prefix}Payload?.message?.text ?? '[no text]'}\`, data: { message: ${prefix}Payload?.message } });`,
      '} else {',
      `  ${JOURNAL_FN}({ kind: 'user-input', level: 'warn', message: 'No message: timed out', data: { timeout: true } });`,
      '}',
      `switch (${prefix}Answered ? ${JSON.stringify(REPLY_WAIT_MESSAGE_LABEL)} : ${TIMEOUT_CASE_VALUE}) {`,
      indentLines(cases),
      '}',
    ].join('\n');
  };
};
