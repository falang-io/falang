import {
  buildActionNodeConfig,
  buildQuestionNodeConfig,
  getIntegrationNodeConfigs,
} from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_TYPE_ID,
  MAX_ON_COMMAND_TRIGGER_NAME,
  MAX_QUESTION_NAME,
  MAX_SEND_BUTTONS_NAME,
  MAX_SEND_FILE_NAME,
  MAX_SEND_MESSAGE_NAME,
  MAX_TRIGGER_NAME,
  maxIntegration,
} from './max.integration.js';
import en from './locales/en.json';
import ru from './locales/ru.json';

/** Every `max:a.b.c` key used by the descriptor, read from the descriptor itself. */
const collectLabelKeys = (value: unknown, keys: Set<string>): void => {
  if (typeof value === 'string' && value.startsWith('max:')) keys.add(value.slice('max:'.length));
  else if (Array.isArray(value)) for (const item of value) collectLabelKeys(item, keys);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectLabelKeys(item, keys);
};

const lookup = (bundle: Record<string, unknown>, key: string): unknown => {
  let node: unknown = bundle.max;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | null)?.[part] ?? null;
  return node;
};

describe('maxIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    expect(getIntegrationNodeConfigs([maxIntegration]).map((config) => config.name)).toEqual([
      MAX_TRIGGER_NAME,
      MAX_ON_COMMAND_TRIGGER_NAME,
      'max-member-joined',
      'max-member-left',
      MAX_SEND_MESSAGE_NAME,
      MAX_SEND_FILE_NAME,
      MAX_SEND_BUTTONS_NAME,
      'max-remove-member',
      'max-delete-message',
    ]);
  });

  it('max-send-message data schema accepts the declared fields and emits a plain activity call', () => {
    const config = buildActionNodeConfig(maxIntegration.actions[0]);
    const data = { credentialId: 'cred-1', chatId: 'message.chat.id', text: 'hi' };
    // A node saved before `recipient` existed gets the default — it keeps sending to the chat.
    expect(config.data?.type.parse(data)).toEqual({ ...data, recipient: 'chat' });
    expect(maxIntegration.actions[0].emit({ credentialId: "'cred-1'", chatId: 'message.chat.id', text: '`hi`' })).toBe(
      "await maxSendMessage('cred-1', message.chat.id, `hi`, 'chat');",
    );
  });

  it('a new send/question node starts on "user", a node saved before "Send to" existed parses to "chat"', () => {
    for (const action of maxIntegration.actions.filter((item) => item.fields.some((f) => f.name === 'recipient'))) {
      const config = buildActionNodeConfig(action);
      expect(config.data?.default()).toMatchObject({ recipient: 'user' });
      const { recipient: _omitted, ...saved } = config.data?.default() as Record<string, string>;
      expect(config.data?.type.parse(saved)).toMatchObject({ recipient: 'chat' });
    }
    const question = maxIntegration.questions?.[0];
    const [header] = question ? buildQuestionNodeConfig(question) : [];
    expect(header?.data?.default()).toMatchObject({ recipient: 'user' });
  });

  it('every send action can address a user instead of a chat', () => {
    const sends = maxIntegration.actions.filter((action) =>
      ['max-send-message', 'max-send-file', 'max-send-buttons'].includes(action.name),
    );
    expect(sends).toHaveLength(3);
    for (const action of sends) {
      expect(action.fields.map((field) => field.name)).toContain('recipient');
      expect(action.emit({ chatId: 'user.maxId', recipient: '"user"' })).toContain("'user');");
      expect(action.emit({ chatId: 'message.chat.id', recipient: '""' })).toContain("'chat');");
      expect(action.activityCode).toContain('maxRecipientQuery(recipient, chatId)');
      expect(action.activityCode).not.toContain('{ chat_id: chatId }');
    }
    expect(maxIntegration.sharedActivityCode).toContain("recipient === 'user' ? { user_id: id } : { chat_id: id }");
    const question = maxIntegration.questions?.[0];
    expect(question?.contextFields.map((field) => field.name)).toEqual(['credentialId', 'recipient', 'chatId']);
    for (const code of [question?.askActivityCode, question?.resolveActivityCode, question?.closeActivityCode]) {
      expect(code).toContain('  recipient: string,');
    }
    expect(question?.askActivityCode).toContain('maxRecipientQuery(recipient, chatId)');
  });

  it('builds a question node kind with the declared fields', () => {
    const question = maxIntegration.questions?.[0];
    const configs = question ? buildQuestionNodeConfig(question) : [];
    expect(configs.map((config) => config.name)).toEqual([MAX_QUESTION_NAME, `${MAX_QUESTION_NAME}-option`]);
  });

  it('activity code names every helper after `max` so it never collides with another vendor', () => {
    const shared = maxIntegration.sharedActivityCode ?? '';
    expect(shared).toContain(
      "const MAX_API_BASE_URL = process.env.MAX_API_BASE_URL ?? 'https://platform-api2.max.ru';",
    );
    expect(shared).toContain('readFileBytes as maxReadFileBytes');
    expect(shared).toContain("vendor: 'max', field: 'botToken'");
    const declared = [...shared.matchAll(/^const (\w+)/gm)].map((match) => match[1]);
    for (const name of declared) expect(name.toLowerCase()).toContain('max');
  });

  it('activities reach MAX through the resolved { token, apiBaseUrl } pair, so a sandbox relay can stand in', () => {
    const shared = maxIntegration.sharedActivityCode ?? '';
    expect(shared).toContain('Promise<{ token: string; apiBaseUrl: string }>');
    expect(shared).toContain('apiBaseUrl: data.apiBaseUrl ?? MAX_API_BASE_URL');
    expect(shared).toContain('new URL(`${bot.apiBaseUrl}/${path}`)');
    expect(shared).not.toContain('${MAX_API_BASE_URL}/');
  });

  it('question activities send an inline keyboard and remove it after the answer', () => {
    const question = maxIntegration.questions?.[0];
    expect(question?.askActivityCode).toContain("type: 'inline_keyboard'");
    expect(question?.askActivityCode).toContain("type: 'callback', text: label, payload: label");
    expect(question?.resolveActivityCode).toContain('maxStripButtons');
    expect(question?.closeActivityCode).toContain('maxStripButtons');
  });

  it('declares the trigger payload as the `max/Message` struct', () => {
    expect(maxIntegration.triggers[0].scopeType).toEqual({ type: 'struct', id: MAX_MESSAGE_TYPE_ID });
    const message = maxIntegration.types?.find((type) => type.id === MAX_MESSAGE_TYPE_ID);
    expect(message?.name).toBe('MaxMessage');
    expect(message?.properties.messageId).toEqual({ type: 'string' });
  });

  it('every trigger has agent notes and the webhook path of the max vendor', () => {
    for (const trigger of maxIntegration.triggers) {
      expect(trigger.notes.length).toBeGreaterThan(50);
      expect(trigger.webhookPath).toBe('/webhooks/max/:projectId/:credentialId/:env');
    }
  });

  it('every label key used by the descriptor exists in both locales', () => {
    const keys = new Set<string>();
    collectLabelKeys(maxIntegration, keys);
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) {
      expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
      expect(typeof lookup(ru, key), `ru: ${key}`).toBe('string');
    }
  });

  it('the message triggers carry the chatType and conversation selects with defaults', () => {
    for (const trigger of maxIntegration.triggers.slice(0, 2)) {
      const names = trigger.contextFields?.map((field) => field.name) ?? [];
      expect(names).toEqual(expect.arrayContaining(['chatType', 'conversation']));
      expect(trigger.contextFields?.find((field) => field.name === 'chatType')?.defaultValue).toBe('any');
      expect(trigger.contextFields?.find((field) => field.name === 'conversation')?.defaultValue).toBe('per-chat');
      expect(trigger.notes).toContain('per-event');
    }
  });

  it('member triggers deliver by signal with the `event` variable and the max/MemberEvent type', () => {
    const member = maxIntegration.triggers.filter((trigger) => trigger.name.startsWith('max-member-'));
    expect(member.map((trigger) => trigger.signalName)).toEqual(['maxMemberJoined', 'maxMemberLeft']);
    for (const trigger of member) {
      expect(trigger.scopeVariableName).toBe('event');
      expect(trigger.scopeType).toEqual({ type: 'struct', id: 'max/MemberEvent' });
      expect(trigger.journalMessage).toContain('event.user.firstName');
      expect(trigger.delivery ?? 'signal').toBe('signal');
    }
    expect(maxIntegration.types?.map((type) => type.id)).toEqual(
      expect.arrayContaining(['max/MemberEvent', 'max/MemberEventChat']),
    );
  });

  it('vendor notes carry the moderation keywords', () => {
    for (const word of ['moderation', 'remove', 'block', 'kick', 'group', 'chat', 'community', 'member']) {
      expect(maxIntegration.notes.toLowerCase()).toContain(word);
    }
  });
});
