import type { IFieldConfig, IIntegrationStructType } from './types.js';

/**
 * What a messenger "send" action (send message / with buttons / file) returns: `success` — the message was delivered to
 * the messenger; `disabled` — the bot can no longer write to that chat (the user blocked or deleted the bot, the account
 * is gone, the bot was removed from the group). A disabled recipient is `{ success: false, disabled: true }` instead of
 * a failed activity, so a workflow can e.g. mark the subscriber inactive; any other error still fails (and retries) the
 * activity as before.
 */
export interface IMessageSendResult {
  readonly success: boolean;
  readonly disabled: boolean;
}

/** The result's TypeScript shape inside generated activity signatures (no struct names there — see `activitySignature`). */
export const MESSAGE_SEND_RESULT_TS_TYPE = '{ success: boolean; disabled: boolean }';

/** Name of the optional `new-variable` field that receives the result. */
export const MESSAGE_SEND_RESULT_FIELD_NAME = 'resultVariable';

export const buildMessageSendResultStructType = (id: string, name: string): IIntegrationStructType => ({
  id,
  name,
  properties: {
    success: { type: 'boolean' },
    disabled: { type: 'boolean' },
  },
});

const SEND_RESULT_AGENT_NOTES =
  'The variable gets `{ success: boolean, disabled: boolean }`. `disabled` is true when the bot can no longer write ' +
  'to this chat (the user blocked or deleted the bot, the account was deleted, the bot was removed from the group); ' +
  'then `success` is false and the workflow continues instead of failing — check `disabled` to stop messaging that ' +
  'user. Other errors still fail the node.';

/**
 * The optional result-variable field of a send action. `defaultValue: ''` keeps nodes saved before the field existed
 * loadable, and an empty name declares nothing.
 */
export const buildMessageSendResultField = (label: string, help: string): IFieldConfig => ({
  name: MESSAGE_SEND_RESULT_FIELD_NAME,
  label,
  help,
  agentNotes: SEND_RESULT_AGENT_NOTES,
  kind: 'new-variable',
  defaultValue: '',
});

/** The call site of a send action: `const <var> = <call>;` when a result variable is set, else `<call>;`. */
export const emitMessageSend = (fields: Readonly<Record<string, string>>, call: string): string => {
  const variable = fields[MESSAGE_SEND_RESULT_FIELD_NAME];
  return variable ? `const ${variable} = ${call};` : `${call};`;
};
