import { describe, expect, it } from 'vitest';
import {
  DRIVER_BUNDLE_FILE_SUFFIX,
  DRIVER_BUNDLE_JSON_SCHEMA,
  DriverBundleValidationError,
  parseDriverBundle,
  type IDriverBundle,
} from './driver-bundle.js';

const validBundle = (): IDriverBundle => ({
  formatVersion: 1,
  config: {
    id: 'my-sensor',
    label: 'My sensor',
    includes: ['my.h'],
    sourceFiles: ['my.h', 'my.cpp'],
    declarations: ['declare function my_read(pin: number): number;'],
    actions: [
      {
        id: 'read',
        label: 'Read',
        fields: [{ name: 'pin', label: 'Pin', kind: 'pin', default: '2' }],
        codeTemplate: 'my_read(${pin})',
      },
    ],
  },
  files: { 'my.h': '// h', 'my.cpp': '// cpp' },
});

const messagesOf = (input: unknown): readonly string[] => {
  try {
    parseDriverBundle(input);
  } catch (error) {
    if (error instanceof DriverBundleValidationError) return error.messages;
    throw error;
  }
  return [];
};

describe('parseDriverBundle', () => {
  it('accepts a valid bundle', () => {
    expect(parseDriverBundle(validBundle()).config.id).toBe('my-sensor');
  });

  it('reports a missing file and an extra file separately', () => {
    const bundle = validBundle();
    const messages = messagesOf({ ...bundle, files: { 'my.h': '//', 'extra.txt': 'x' } });
    expect(messages.some((m) => m.includes('missing "my.cpp"'))).toBe(true);
    expect(messages.some((m) => m.includes('"extra.txt" is not listed'))).toBe(true);
  });

  it('rejects a non-flat file name', () => {
    const bundle = validBundle();
    const messages = messagesOf({ ...bundle, files: { ...bundle.files, '../evil.h': 'x' } });
    expect(messages.some((m) => m.includes('"../evil.h" must be a flat filename'))).toBe(true);
  });

  it('enforces the per-file and total size caps (UTF-8 bytes)', () => {
    const bundle = validBundle();
    // 280 KB in UTF-8 (2 bytes per character).
    const big = 'я'.repeat(140 * 1024);
    expect(
      messagesOf({ ...bundle, files: { ...bundle.files, 'my.cpp': big } }).some((m) => m.includes('over the')),
    ).toBe(true);
    const config = { ...bundle.config, sourceFiles: ['a.h', 'b.h', 'c.h', 'd.h', 'e.h'], includes: ['a.h'] };
    const chunk = 'x'.repeat(250 * 1024);
    const files = Object.fromEntries(['a.h', 'b.h', 'c.h', 'd.h', 'e.h'].map((n) => [n, chunk]));
    expect(messagesOf({ ...bundle, config, files }).some((m) => m.includes('in total'))).toBe(true);
  });

  it('surfaces config rule violations and structural errors', () => {
    const bundle = validBundle();
    const badTemplate = { ...bundle.config, actions: [{ ...bundle.config.actions[0], codeTemplate: 'x(${nope})' }] };
    expect(messagesOf({ ...bundle, config: badTemplate }).some((m) => m.includes('unknown field "nope"'))).toBe(true);
    expect(messagesOf({ formatVersion: 2 }).length).toBeGreaterThan(0);
    expect(messagesOf('nope').length).toBeGreaterThan(0);
  });

  it('exposes a JSON Schema and the file suffix', () => {
    expect(DRIVER_BUNDLE_JSON_SCHEMA.type).toBe('object');
    expect(DRIVER_BUNDLE_FILE_SUFFIX).toBe('.falang-driver.json');
  });
});
