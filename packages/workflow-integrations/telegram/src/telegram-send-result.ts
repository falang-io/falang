import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildMessageSendResultField,
  MESSAGE_SEND_RESULT_TS_TYPE,
  type IFieldConfig,
} from '@falang/workflow-integrations-common';
import { TELEGRAM_SEND_RESULT_TYPE_ID } from './constants.js';

export const TELEGRAM_SEND_RESULT_TYPE: TVariableInfo = { type: 'struct', id: TELEGRAM_SEND_RESULT_TYPE_ID };

export const TELEGRAM_SEND_RESULT_FIELD: IFieldConfig = buildMessageSendResultField(
  'telegram:field.resultVariable',
  'telegram:help.sendResult',
);

/**
 * Telegram's "this bot can no longer write here" answers — always HTTP 403 with a `Forbidden: …` description: the user
 * blocked the bot or deleted their account, the bot was removed from (or never added to) the group or channel, the
 * user never started the bot. Matched on the description: the sandbox relay (ADR 0073 (private)) answers its own
 * refusals with 403 too, and those are not a disabled bot.
 */
export const TELEGRAM_BOT_DISABLED_PATTERN =
  /Forbidden: (bot was blocked by the user|user is deactivated|bot was kicked|bot is not a member|bot can't initiate conversation|the group chat was deleted)/i;

/**
 * Shared activity helper (see `sharedActivityCode` in `telegram.integration.ts`): runs one send and reports
 * `{ success, disabled }` — a disabled bot is not an error, anything else is rethrown (the activity retries as before).
 */
export const TELEGRAM_SEND_GUARD_CODE = [
  `const TELEGRAM_BOT_DISABLED_PATTERN = ${TELEGRAM_BOT_DISABLED_PATTERN.toString()};`,
  `const telegramSendGuarded = async (send: () => Promise<void>): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> => {`,
  '  try {',
  '    await send();',
  '    return { success: true, disabled: false };',
  '  } catch (error) {',
  '    const message = error instanceof Error ? error.message : String(error);',
  '    if (TELEGRAM_BOT_DISABLED_PATTERN.test(message)) return { success: false, disabled: true };',
  '    throw error;',
  '  }',
  '};',
].join('\n');
