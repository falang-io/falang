import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildMessageSendResultField,
  MESSAGE_SEND_RESULT_TS_TYPE,
  type IFieldConfig,
} from '@falang/workflow-integrations-common';
import { VK_SEND_RESULT_TYPE_ID } from './constants.js';

export const VK_SEND_RESULT_TYPE: TVariableInfo = { type: 'struct', id: VK_SEND_RESULT_TYPE_ID };

export const VK_SEND_RESULT_FIELD: IFieldConfig = buildMessageSendResultField(
  'vk:field.resultVariable',
  'vk:help.sendResult',
);

/**
 * VK API errors meaning the community can no longer write to the peer: 900 — the user put the community on the
 * blacklist, 901 — the user hasn't allowed (or has forbidden) messages from the community, 902 — the user's privacy
 * settings, 917 — the community has no access to the conversation (removed from it).
 */
export const VK_BOT_DISABLED_ERROR_CODES: readonly number[] = [900, 901, 902, 917];

/**
 * Shared activity helper (see `VK_SHARED_ACTIVITY_CODE`): runs one send and reports `{ success, disabled }` — a
 * disabled bot is not an error, anything else is rethrown (the activity retries as before). Needs `vkErrorCode`.
 */
export const VK_SEND_GUARD_CODE = [
  `const VK_BOT_DISABLED_ERROR_CODES: readonly number[] = ${JSON.stringify(VK_BOT_DISABLED_ERROR_CODES)};`,
  `const vkSendGuarded = async (send: () => Promise<void>): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> => {`,
  '  try {',
  '    await send();',
  '    return { success: true, disabled: false };',
  '  } catch (error) {',
  '    const code = vkErrorCode(error);',
  '    if (code !== undefined && VK_BOT_DISABLED_ERROR_CODES.includes(code)) return { success: false, disabled: true };',
  '    throw error;',
  '  }',
  '};',
].join('\n');
