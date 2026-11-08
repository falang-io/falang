import { describe, expect, it } from 'vitest';
import { splitHelpLine, translateFieldText } from './field-help.js';

const t = (key: string): string => `<${key}>`;

describe('translateFieldText', () => {
  it('translates an i18n key', () => {
    expect(translateFieldText(t, 'tables:help.where')).toBe('<tables:help.where>');
  });

  it('keeps literal text, even with a colon in it', () => {
    expect(translateFieldText(t, 'Пример: 2026-01-01T00:00:00Z')).toBe('Пример: 2026-01-01T00:00:00Z');
    expect(translateFieldText(t, 'Номер счёта')).toBe('Номер счёта');
  });
});

describe('splitHelpLine', () => {
  it('marks backticked segments as code', () => {
    expect(splitHelpLine('Например `{ a: 1 }` — равно')).toEqual([
      { text: 'Например ', code: false },
      { text: '{ a: 1 }', code: true },
      { text: ' — равно', code: false },
    ]);
  });

  it('keeps a line with an unpaired backtick as plain text', () => {
    expect(splitHelpLine('a ` b')).toEqual([{ text: 'a ` b', code: false }]);
  });
});
