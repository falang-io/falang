import { collectActivityJournal, parseActivityParamNames } from '@falang/workflow-compiler';
import { describe, expect, it } from 'vitest';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';

describe('run journal specs of every registered vendor (ADR 0059)', () => {
  it('every allowlisted journal arg is a parameter of its activity signature (collectActivityJournal throws otherwise)', () => {
    const { journal, params } = collectActivityJournal(REGISTERED_INTEGRATIONS);
    for (const [name, spec] of Object.entries(journal)) {
      for (const arg of spec.args) expect(params[name], `${name}.${arg}`).toContain(arg);
    }
  });

  it('every signature in the repo parses into parameter names', () => {
    for (const integration of REGISTERED_INTEGRATIONS) {
      const signatures = [
        ...integration.actions.map((action) => action.activitySignature),
        ...(integration.questions ?? []).flatMap((q) => [q.askActivitySignature, q.resolveActivitySignature]),
        ...(integration.choices ?? []).map((choice) => choice.activitySignature),
      ];
      for (const signature of signatures) expect(() => parseActivityParamNames(signature), signature).not.toThrow();
    }
  });

  it('covers the vendors listed in ADR 0059 §2b', () => {
    const { journal } = collectActivityJournal(REGISTERED_INTEGRATIONS);
    const expected: Record<string, string> = {
      callAiText: 'ai',
      callAiChoice: 'ai',
      callAiImage: 'ai',
      callAiTranscribe: 'ai',
      gigachatCallText: 'ai',
      yandexgptCallText: 'ai',
      telegramSendMessage: 'message-out',
      telegramSendFile: 'message-out',
      telegramAskQuestion: 'message-out',
      humanTaskAsk: 'message-out',
    };
    for (const [name, kind] of Object.entries(expected)) expect(journal[name]?.kind, name).toBe(kind);
  });
});
