import ts from 'typescript';
import {
  buildActionNodeConfig,
  buildQuestionNodeConfig,
  getIntegrationNodeConfigs,
} from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ru from './locales/ru.json';
import {
  VK_MESSAGE_TYPE_ID,
  VK_ON_COMMAND_TRIGGER_NAME,
  VK_QUESTION_NAME,
  VK_SEND_BUTTONS_NAME,
  VK_SEND_FILE_NAME,
  VK_SEND_MESSAGE_NAME,
  VK_TRIGGER_NAME,
  vkIntegration,
} from './vk.integration.js';

/** Every `vk:a.b.c` key used by the descriptor, read from the descriptor itself. */
const collectLabelKeys = (value: unknown, keys: Set<string>): void => {
  if (typeof value === 'string' && value.startsWith('vk:')) keys.add(value.slice('vk:'.length));
  else if (Array.isArray(value)) for (const item of value) collectLabelKeys(item, keys);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectLabelKeys(item, keys);
};

const lookup = (bundle: Record<string, unknown>, key: string): unknown => {
  let node: unknown = bundle.vk;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | null)?.[part] ?? null;
  return node;
};

describe('vkIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    expect(getIntegrationNodeConfigs([vkIntegration]).map((config) => config.name)).toEqual([
      VK_TRIGGER_NAME,
      VK_ON_COMMAND_TRIGGER_NAME,
      'vk-group-member-joined',
      'vk-group-member-left',
      'vk-join-request',
      'vk-chat-member-joined',
      'vk-chat-member-left',
      VK_SEND_MESSAGE_NAME,
      VK_SEND_FILE_NAME,
      VK_SEND_BUTTONS_NAME,
      'vk-kick-from-chat',
      'vk-delete-message',
    ]);
  });

  it('vk-send-message data schema accepts the declared fields and emits a plain activity call', () => {
    const config = buildActionNodeConfig(vkIntegration.actions[0]);
    const data = { credentialId: 'cred-1', chatId: 'message.chat.id', text: 'hi' };
    expect(config.data?.type.parse(data)).toEqual(data);
    expect(vkIntegration.actions[0].emit({ credentialId: "'cred-1'", chatId: 'message.chat.id', text: '`hi`' })).toBe(
      "await vkSendMessage('cred-1', message.chat.id, `hi`);",
    );
  });

  it('builds a question node kind with the declared fields', () => {
    const question = vkIntegration.questions?.[0];
    const configs = question ? buildQuestionNodeConfig(question) : [];
    expect(configs.map((config) => config.name)).toEqual([VK_QUESTION_NAME, `${VK_QUESTION_NAME}-option`]);
  });

  it('declares the access key as the one secret credential field', () => {
    expect(vkIntegration.credentialFields).toEqual([
      { name: 'accessToken', label: 'vk:credentialField.accessToken', kind: 'secret' },
    ]);
  });

  it('activity code names every helper after `vk` so it never collides with another vendor', () => {
    const shared = vkIntegration.sharedActivityCode ?? '';
    expect(shared).toContain("const VK_API_BASE_URL = process.env.VK_API_BASE_URL ?? 'https://api.vk.ru';");
    expect(shared).toContain('readFileBytes as vkReadFileBytes');
    expect(shared).toContain("vendor: 'vk', field: 'accessToken'");
    expect(shared).toContain('/method/${method}?v=5.199');
    const declared = [...shared.matchAll(/^const (\w+)/gm)].map((match) => match[1]);
    expect(declared.length).toBeGreaterThan(4);
    for (const name of declared) expect(name.toLowerCase()).toContain('vk');
  });

  it('activities reach VK through the resolved { token, apiBaseUrl } pair, so a sandbox relay can stand in', () => {
    const shared = vkIntegration.sharedActivityCode ?? '';
    expect(shared).toContain('apiBaseUrl: data.apiBaseUrl ?? VK_API_BASE_URL');
    expect(shared).toContain('`${bot.apiBaseUrl}/method/${method}');
    expect(shared).toContain('Bearer ${bot.token}');
  });

  it('question activities send callback buttons with a { falang } payload and remove them afterwards', () => {
    const question = vkIntegration.questions?.[0];
    expect(question?.askActivityCode).toContain("type: 'callback'");
    expect(question?.askActivityCode).toContain('JSON.stringify({ falang: answer })');
    expect(question?.askActivityCode).toContain('peer_ids: String(chatId)');
    expect(question?.resolveActivityCode).toContain('vkStripButtons');
    expect(question?.closeActivityCode).toContain('vkStripButtons');
  });

  it('all generated activity code is syntactically valid TypeScript', () => {
    const question = vkIntegration.questions?.[0];
    const pieces = [
      vkIntegration.sharedActivityCode,
      ...vkIntegration.actions.map((action) => action.activityCode),
      question?.askActivityCode,
      question?.resolveActivityCode,
      question?.closeActivityCode,
    ];
    const diagnostics = ts.transpileModule(pieces.join('\n'), {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).diagnostics;
    expect(diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  });

  it('declares the trigger payload as the `vk/Message` struct', () => {
    expect(vkIntegration.triggers[0].scopeType).toEqual({ type: 'struct', id: VK_MESSAGE_TYPE_ID });
    const message = vkIntegration.types?.find((type) => type.id === VK_MESSAGE_TYPE_ID);
    expect(message?.name).toBe('VkMessage');
  });

  it('every trigger has agent notes and the webhook path of the vk vendor', () => {
    for (const trigger of vkIntegration.triggers) {
      expect(trigger.notes.length).toBeGreaterThan(50);
      expect(trigger.webhookPath).toBe('/webhooks/vk/:projectId/:credentialId/:env');
    }
  });

  it('every label key used by the descriptor exists in both locales', () => {
    const keys = new Set<string>();
    collectLabelKeys(vkIntegration, keys);
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) {
      expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
      expect(typeof lookup(ru, key), `ru: ${key}`).toBe('string');
    }
  });

  it('both message triggers carry the chatType and conversation selects with the defaults', () => {
    for (const name of [VK_TRIGGER_NAME, VK_ON_COMMAND_TRIGGER_NAME]) {
      const trigger = vkIntegration.triggers.find((item) => item.name === name);
      const fields = trigger?.contextFields ?? [];
      expect(fields.find((field) => field.name === 'chatType')).toMatchObject({
        kind: 'select',
        defaultValue: 'any',
        options: [{ value: 'any' }, { value: 'private' }, { value: 'group' }],
      });
      expect(fields.find((field) => field.name === 'conversation')).toMatchObject({
        kind: 'select',
        defaultValue: 'per-chat',
        options: [{ value: 'per-chat' }, { value: 'per-user' }, { value: 'per-event' }],
      });
      expect(trigger?.notes).toContain('chatType');
      expect(trigger?.notes).toContain('per-event');
    }
  });

  it('declares the five member triggers with their own signal, scope variable and struct', () => {
    const member = (name: string) => vkIntegration.triggers.find((trigger) => trigger.name === name);
    expect(member('vk-group-member-joined')).toMatchObject({
      signalName: 'vkGroupMemberJoined',
      scopeVariableName: 'event',
      scopeType: { type: 'struct', id: 'vk/GroupMemberEvent' },
    });
    expect(member('vk-join-request')).toMatchObject({ scopeVariableName: 'request' });
    expect(member('vk-join-request')?.notes).toContain('NOTIFICATION ONLY');
    expect(member('vk-chat-member-left')?.scopeType).toEqual({ type: 'struct', id: 'vk/ChatMemberEvent' });
    const signals = vkIntegration.triggers.map((trigger) => trigger.signalName);
    expect(new Set(signals).size).toBe(signals.length - 1);
  });

  it('the vendor notes carry the moderation keywords', () => {
    for (const word of ['moderation', 'kick', 'group', 'community', 'conversation', 'chat', 'member', 'join request']) {
      expect(vkIntegration.notes.toLowerCase()).toContain(word);
    }
  });
});
