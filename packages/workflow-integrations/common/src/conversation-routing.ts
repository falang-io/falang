import type { IFieldConfig } from './types.js';

/**
 * Shared conversation routing for the messenger vendors (telegram `tg-`, max `max-`, vk `vk-`), ADR 0076 (private) §2:
 * which workflow run an incoming message / member event belongs to, and which chats a trigger listens to.
 * Pure — no node:* imports — because the package is reached from the browser bundle.
 */

export type TConversationMode = 'per-chat' | 'per-user' | 'per-event';
export const CONVERSATION_MODES: readonly TConversationMode[] = ['per-chat', 'per-user', 'per-event'];
export const DEFAULT_CONVERSATION_MODE: TConversationMode = 'per-chat';

export type TChatTypeFilter = 'any' | 'private' | 'group';
export const CHAT_TYPE_FILTERS: readonly TChatTypeFilter[] = ['any', 'private', 'group'];
export const DEFAULT_CHAT_TYPE_FILTER: TChatTypeFilter = 'any';

/** Normalised chat type each vendor computes itself (Telegram group/supergroup/channel, MAX chat/channel, VK peer_id > 2e9 → group). */
export type TChatKind = 'private' | 'group';

export const CONVERSATION_FIELD_NAME = 'conversation';
export const CHAT_TYPE_FIELD_NAME = 'chatType';

type TTriggerConfig = Readonly<Record<string, string>> | null | undefined;

export const resolveConversationMode = (triggerConfig?: TTriggerConfig): TConversationMode => {
  const value = triggerConfig?.[CONVERSATION_FIELD_NAME];
  return CONVERSATION_MODES.find((mode) => mode === value) ?? DEFAULT_CONVERSATION_MODE;
};

export const resolveChatTypeFilter = (triggerConfig?: TTriggerConfig): TChatTypeFilter => {
  const value = triggerConfig?.[CHAT_TYPE_FIELD_NAME];
  return CHAT_TYPE_FILTERS.find((filter) => filter === value) ?? DEFAULT_CHAT_TYPE_FILTER;
};

export const chatTypeAdmits = (filter: TChatTypeFilter, chatKind: TChatKind): boolean =>
  filter === 'any' || filter === chatKind;

export interface IConversationWorkflowIdParams {
  readonly vendorPrefix: string;
  readonly documentId: string;
  readonly chatId: string | number;
  readonly userId?: string | number;
  readonly eventKey?: string | number;
  readonly mode: TConversationMode;
}

/** `<prefix>-<doc>-<chatId>` (per-chat), `…-<userId>` (per-user), `…-<eventKey>` (per-event). */
const isBlank = (value: string | number | null | undefined): boolean => String(value ?? '') === '';

/** `<prefix>-<doc>-<chatId>` (per-chat), `…-<userId>` (per-user), `…-<eventKey>` (per-event). */
export const buildConversationWorkflowId = (params: IConversationWorkflowIdParams): string => {
  const base = `${params.vendorPrefix}-${params.documentId}-${params.chatId}`;
  if (params.mode === 'per-user') {
    if (isBlank(params.userId)) {
      throw new Error('buildConversationWorkflowId: userId is required for the per-user conversation mode');
    }
    return `${base}-${params.userId}`;
  }
  if (params.mode === 'per-event') {
    if (isBlank(params.eventKey)) {
      throw new Error('buildConversationWorkflowId: eventKey is required for the per-event conversation mode');
    }
    return `${base}-${params.eventKey}`;
  }
  return base;
};

export interface IMemberEventWorkflowIdParams {
  readonly vendorPrefix: string;
  readonly documentId: string;
  readonly chatId: string | number;
  readonly userId: string | number;
  readonly eventKey: string | number;
}

/** Member triggers are always per-event: `<prefix>-<doc>-<chatId>-<userId>-<eventKey>`. */
export const buildMemberEventWorkflowId = (params: IMemberEventWorkflowIdParams): string => {
  for (const key of ['userId', 'eventKey'] as const) {
    if (isBlank(params[key])) {
      throw new Error(`buildMemberEventWorkflowId: ${key} is required`);
    }
  }
  return `${params.vendorPrefix}-${params.documentId}-${params.chatId}-${params.userId}-${params.eventKey}`;
};

/** i18n keys (or plain text) supplied by the vendor. */
export interface IChatTypeFieldLabels {
  readonly label: string;
  readonly any: string;
  readonly private: string;
  readonly group: string;
}

export interface IConversationFieldLabels {
  readonly label: string;
  readonly perChat: string;
  readonly perUser: string;
  readonly perEvent: string;
}

export const buildChatTypeContextField = (labels: IChatTypeFieldLabels): IFieldConfig => ({
  name: CHAT_TYPE_FIELD_NAME,
  label: labels.label,
  kind: 'select',
  options: [
    { value: 'any', label: labels.any },
    { value: 'private', label: labels.private },
    { value: 'group', label: labels.group },
  ],
  defaultValue: DEFAULT_CHAT_TYPE_FILTER,
});

export const buildConversationContextField = (labels: IConversationFieldLabels): IFieldConfig => ({
  name: CONVERSATION_FIELD_NAME,
  label: labels.label,
  kind: 'select',
  options: [
    { value: 'per-chat', label: labels.perChat },
    { value: 'per-user', label: labels.perUser },
    { value: 'per-event', label: labels.perEvent },
  ],
  defaultValue: DEFAULT_CONVERSATION_MODE,
});
