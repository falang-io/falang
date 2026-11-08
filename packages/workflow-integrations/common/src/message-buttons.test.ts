import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  buildPrepareButtonsActivityCode,
  decodeButtonCommand,
  MAX_MESSAGE_BUTTONS,
  MESSAGE_BUTTON_COMMAND_PREFIX,
  normalizeButtonCommand,
  parseMessageButtons,
  serializeMessageButtons,
} from './message-buttons.js';

describe('parseMessageButtons', () => {
  it('reads an empty value as no buttons', () => {
    expect(parseMessageButtons('')).toEqual({ buttons: [] });
    expect(parseMessageButtons('[]')).toEqual({ buttons: [] });
  });

  it('round-trips through serializeMessageButtons', () => {
    const buttons = [
      { kind: 'url' as const, text: 'Site', value: 'https://example.com/${id}' },
      { kind: 'command' as const, text: 'Help', value: '/help' },
    ];
    expect(parseMessageButtons(serializeMessageButtons(buttons))).toEqual({ buttons });
  });

  it('treats a missing value as empty', () => {
    expect(parseMessageButtons('[{"kind":"command","text":"Go"}]').buttons).toEqual([
      { kind: 'command', text: 'Go', value: '' },
    ]);
  });

  it.each([
    ['not json', 'not valid JSON'],
    ['{}', 'must be a JSON array'],
    ['[1]', 'button 1 is not an object'],
    ['[{"kind":"reply","text":"x","value":""}]', '"kind" must be'],
    ['[{"kind":"url","text":1,"value":""}]', '"text" must be a string'],
    ['[{"kind":"url","text":"x","value":2}]', '"value" must be a string'],
  ])('reports %s as an error', (raw, message) => {
    const parsed = parseMessageButtons(raw);
    expect(parsed.buttons).toEqual([]);
    expect(parsed.error).toContain(message);
  });

  it('refuses more than the maximum', () => {
    const many = Array.from({ length: MAX_MESSAGE_BUTTONS + 1 }, () => ({ kind: 'url', text: 'x', value: 'y' }));
    expect(parseMessageButtons(JSON.stringify(many)).error).toContain(`At most ${MAX_MESSAGE_BUTTONS}`);
  });
});

describe('button commands', () => {
  it('normalizes the leading slash', () => {
    expect(normalizeButtonCommand(' help ')).toBe('/help');
    expect(normalizeButtonCommand('/buy 42')).toBe('/buy 42');
    expect(normalizeButtonCommand('  ')).toBe('');
  });

  it('decodes only prefixed callback data', () => {
    expect(decodeButtonCommand(`${MESSAGE_BUTTON_COMMAND_PREFIX}/help`)).toBe('/help');
    expect(decodeButtonCommand(`${MESSAGE_BUTTON_COMMAND_PREFIX}menu`)).toBe('/menu');
    expect(decodeButtonCommand(MESSAGE_BUTTON_COMMAND_PREFIX)).toBeUndefined();
    expect(decodeButtonCommand('/help')).toBeUndefined();
    expect(decodeButtonCommand(null)).toBeUndefined();
  });
});

describe('buildPrepareButtonsActivityCode', () => {
  // The emitted TypeScript, transpiled and run as the runner would.
  const source = ts.transpileModule(`${buildPrepareButtonsActivityCode('prepare')}\nresult = prepare(buttons);`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const prepare = (buttons: unknown): unknown => {
    const sandbox: { buttons: unknown; result: unknown } = { buttons, result: null };
    vm.runInNewContext(source, sandbox);
    return sandbox.result;
  };

  it('trims and normalizes commands', () => {
    expect(
      prepare([
        { kind: 'url', text: ' Site ', value: ' https://x ' },
        { kind: 'command', text: 'Help', value: 'help' },
      ]),
    ).toEqual([
      { kind: 'url', text: 'Site', value: 'https://x' },
      { kind: 'command', text: 'Help', value: '/help' },
    ]);
  });

  it('throws on an empty caption or value', () => {
    expect(() => prepare([{ kind: 'url', text: ' ', value: 'x' }])).toThrow('Button 1 has an empty text');
    expect(() => prepare([{ kind: 'command', text: 'Go', value: '' }])).toThrow('empty command');
  });
});
