import {
  buildActionNodeConfig,
  buildQuestionNodeConfig,
  buildTriggerNodeConfig,
  getIntegrationNodeConfigs,
} from '@falang/workflow-integrations-common';
import { FILE_TYPE_ID } from '@falang/workflow-integrations-files';
import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_MESSAGE_TYPE_ID,
  TELEGRAM_ON_COMMAND_TRIGGER_NAME,
  TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME,
  TELEGRAM_QUESTION_NAME,
  TELEGRAM_SEND_FILE_NAME,
  TELEGRAM_SEND_MESSAGE_NAME,
  TELEGRAM_TRIGGER_NAME,
  telegramIntegration,
} from './telegram.integration.js';

describe('telegramIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([telegramIntegration]);
    expect(configs.map((config) => config.name)).toEqual([
      TELEGRAM_TRIGGER_NAME,
      TELEGRAM_ON_COMMAND_TRIGGER_NAME,
      TELEGRAM_SEND_MESSAGE_NAME,
      TELEGRAM_SEND_FILE_NAME,
    ]);
  });

  it('telegram-send-message data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(telegramIntegration.actions[0]);
    const parsed = config.data?.type.parse({ credentialId: 'cred-1', chatId: 'message.chat.id', text: '`hi`' });
    expect(parsed).toEqual({ credentialId: 'cred-1', chatId: 'message.chat.id', text: '`hi`' });
  });

  it('telegram-trigger has no editable data', () => {
    const config = buildTriggerNodeConfig(telegramIntegration.triggers[0]);
    expect(config).toEqual({ name: TELEGRAM_TRIGGER_NAME });
  });

  it('emit() produces a call passing through credentialId/chatId/text verbatim', () => {
    const emitted = telegramIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      chatId: 'message.chat.id',
      text: '`hello`',
    });
    expect(emitted).toBe("await telegramSendMessage('cred-1', message.chat.id, `hello`);");
  });

  it('activityCode is a self-contained, parseable TS module fragment', () => {
    expect(telegramIntegration.actions[0].activityCode).toContain('export const telegramSendMessage');
    expect(telegramIntegration.actions[0].activityCode).toContain('TELEGRAM_API_BASE_URL');
  });

  it('sharedActivityCode declares an overridable TELEGRAM_API_BASE_URL, defaulting to the real Bot API', () => {
    expect(telegramIntegration.sharedActivityCode).toContain(
      "const TELEGRAM_API_BASE_URL = process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org';",
    );
  });

  it('credentialFields declares botToken as a secret (dev/prod-paired, see ADR 0006)', () => {
    expect(telegramIntegration.credentialFields).toEqual([
      { name: 'botToken', label: 'telegram:credentialField.botToken', kind: 'secret' },
    ]);
  });

  it('telegram-trigger scopeType is a struct reference resolvable via `types`, not a bare `any`', () => {
    expect(telegramIntegration.triggers[0].scopeType).toEqual({ type: 'struct', id: TELEGRAM_MESSAGE_TYPE_ID });
    const messageType = telegramIntegration.types?.find((type) => type.id === TELEGRAM_MESSAGE_TYPE_ID);
    expect(messageType?.name).toBe('TelegramMessage');
    expect(messageType?.properties.chat).toEqual({ type: 'struct', id: expect.any(String) });
  });

  it("telegram-on-command-trigger shares onMessage's payload/signal but asks for a command name up front", () => {
    const onCommand = telegramIntegration.triggers.find((trigger) => trigger.name === TELEGRAM_ON_COMMAND_TRIGGER_NAME);
    const onMessage = telegramIntegration.triggers[0];
    expect(onCommand?.scopeType).toEqual(onMessage.scopeType);
    expect(onCommand?.scopeVariableName).toBe(onMessage.scopeVariableName);
    expect(onCommand?.signalName).toBe(onMessage.signalName);
    expect(onCommand?.contextFields).toEqual([{ name: 'command', label: 'telegram:field.command', kind: 'text' }]);
  });

  it('every struct id a registered type references resolves to another entry in `types`, or is a known cross-vendor struct', () => {
    // `files/File` is registered by `@falang/workflow-integrations-files`'s own `types`, not this
    // package's — merged together at runtime by the editor's `TypesRegistryStore` (see
    // `@falang/workflow-scheme`'s `IntegrationsModule`), so a bare per-package check like this one
    // can't resolve it from `telegramIntegration.types` alone.
    const knownCrossVendorIds = new Set([FILE_TYPE_ID]);
    const ids = new Set((telegramIntegration.types ?? []).map((type) => type.id));
    for (const type of telegramIntegration.types ?? []) {
      for (const property of Object.values(type.properties)) {
        if (property.type === 'struct') expect(ids.has(property.id) || knownCrossVendorIds.has(property.id)).toBe(true);
      }
    }
  });

  describe('telegram-question', () => {
    const question = telegramIntegration.questions?.[0];

    it('is registered with the expected name and answer signal', () => {
      expect(question?.name).toBe(TELEGRAM_QUESTION_NAME);
      expect(question?.answerSignalName).toBe(TELEGRAM_QUESTION_ANSWER_SIGNAL_NAME);
    });

    it('splits header fields into contextFields (bot/chat) and questionFields (question text, timeout)', () => {
      expect(question?.contextFields.map((field) => field.name)).toEqual(['credentialId', 'chatId']);
      expect(question?.questionFields.map((field) => field.name)).toEqual(['question', 'timeout']);
    });

    it('sets timeoutField/closeActivitySignature (ADR 0040 (private) §4)', () => {
      expect(question?.timeoutField).toBe('timeout');
      expect(question?.closeActivitySignature).toContain('telegramCloseQuestion(');
      expect(question?.closeActivityCode).toContain('export const telegramCloseQuestion');
    });

    it('produces a header + option node config seeded with 2 default options plus the automatic timeout option', () => {
      const [header, option] = question ? buildQuestionNodeConfig(question) : [];
      expect(header?.name).toBe(TELEGRAM_QUESTION_NAME);
      expect(option?.name).toBe(`${TELEGRAM_QUESTION_NAME}-option`);
      const seeded = header?.factory?.();
      expect(seeded?.children).toHaveLength(3);
      expect(seeded?.children?.map((child) => child.data)).toEqual([
        { label: 'Вариант 1' },
        { label: 'Вариант 2' },
        { label: 'timeout', fixed: true },
      ]);
    });

    it('askActivityCode/resolveActivityCode reference the shared bot-token resolver rather than redeclaring it', () => {
      expect(question?.askActivityCode).toContain('await resolveTelegramBotToken(credentialId)');
      expect(question?.askActivityCode).not.toContain('const resolveTelegramBotToken');
      expect(question?.resolveActivityCode).toContain('await resolveTelegramBotToken(credentialId)');
      expect(question?.resolveActivityCode).not.toContain('const resolveTelegramBotToken');
    });

    it('resolveActivityCode strips the inline keyboard then sends a separate confirmation message', () => {
      expect(question?.resolveActivityCode).toContain('editMessageReplyMarkup');
      expect(question?.resolveActivityCode).toContain('inline_keyboard: [] ');
      expect(question?.resolveActivityCode).toContain('Выбрано ${selectedLabel}');
    });
  });

  it('sharedActivityCode declares resolveTelegramBotToken exactly once, reused by every activity', () => {
    expect(telegramIntegration.sharedActivityCode).toContain('const resolveTelegramBotToken');
    expect(telegramIntegration.actions[0].activityCode).not.toContain('const resolveTelegramBotToken');
  });

  describe('telegram-send-file', () => {
    const action = telegramIntegration.actions.find((candidate) => candidate.name === TELEGRAM_SEND_FILE_NAME);
    if (!action) throw new Error('expected telegram-send-file to be registered');

    it('has the declared fields, "file" typed as the files/File struct', () => {
      expect(action.fields.map((field) => field.name)).toEqual(['credentialId', 'chatId', 'file', 'as', 'caption']);
      const fileField = action.fields.find((field) => field.name === 'file');
      expect(fileField?.expectedType).toEqual({ type: 'struct', id: FILE_TYPE_ID });
    });

    it('emit() passes every field through positionally', () => {
      const emitted = action.emit({
        credentialId: "'cred-1'",
        chatId: 'message.chat.id',
        file: 'myFile',
        as: '"auto"',
        caption: '``',
      });
      expect(emitted).toBe('await telegramSendFile(\'cred-1\', message.chat.id, myFile, "auto", ``);');
    });

    it('is a 10-minute, heartbeating regular activity (streams the file)', () => {
      expect(action.activityOptions).toEqual({
        kind: 'regular',
        startToCloseTimeout: '10 minutes',
        heartbeatTimeout: '1 minute',
      });
    });

    it('activityCode reuses the shared bot-token resolver and the aliased readFileBytes import', () => {
      expect(action.activityCode).toContain('export const telegramSendFile');
      expect(action.activityCode).toContain('await resolveTelegramBotToken(credentialId)');
      expect(action.activityCode).not.toContain('const resolveTelegramBotToken');
      expect(action.activityCode).toContain('telegramReadFileBytes(file,');
      expect(telegramIntegration.sharedActivityCode).toContain(
        "import { readFileBytes as telegramReadFileBytes } from '@falang/workflow-integrations-files';",
      );
      expect(telegramIntegration.sharedActivityCode).toContain(
        "import type { IFileRef } from '@falang/workflow-integrations-files';",
      );
    });
  });
});
