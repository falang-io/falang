import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildMessageSendResultField,
  MESSAGE_SEND_RESULT_TS_TYPE,
  type IFieldConfig,
} from '@falang/workflow-integrations-common';
import { MAX_SEND_RESULT_TYPE_ID } from './constants.js';

export const MAX_SEND_RESULT_TYPE: TVariableInfo = { type: 'struct', id: MAX_SEND_RESULT_TYPE_ID };

export const MAX_SEND_RESULT_FIELD: IFieldConfig = buildMessageSendResultField(
  'max:field.resultVariable',
  'max:help.sendResult',
);

/**
 * MAX reports a bot the user blocked (or a dialog that is otherwise closed to the bot) only through the error text —
 * e.g. `dialog.suspended` — not through a dedicated status or code, so the text is all there is to match.
 */
export const MAX_BOT_DISABLED_PATTERN = /suspended/i;

/**
 * Shared activity helper (see `MAX_SHARED_ACTIVITY_CODE`): runs one send and reports `{ success, disabled }` — a
 * disabled bot is not an error, anything else is rethrown (the activity retries as before). `maxApiRequest`'s errors
 * carry the response text and MAX's `message`, which is where "suspended" appears.
 */
export const MAX_SEND_GUARD_CODE = [
  `const MAX_BOT_DISABLED_PATTERN = ${MAX_BOT_DISABLED_PATTERN.toString()};`,
  `const maxSendGuarded = async (send: () => Promise<void>): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> => {`,
  '  try {',
  '    await send();',
  '    return { success: true, disabled: false };',
  '  } catch (error) {',
  '    const message = error instanceof Error ? error.message : String(error);',
  '    if (MAX_BOT_DISABLED_PATTERN.test(message)) return { success: false, disabled: true };',
  '    throw error;',
  '  }',
  '};',
].join('\n');
