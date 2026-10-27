// oxlint-disable no-undefined, unicorn/no-useless-undefined -- an unset env var is `undefined`.
import { describe, expect, it } from 'vitest';
import { parseNodeSelector, parseTolerations } from './runner-pod-placement.js';

describe('parseNodeSelector', () => {
  it('is undefined for unset and blank input', () => {
    expect(parseNodeSelector(undefined)).toBeUndefined();
    expect(parseNodeSelector('  ')).toBeUndefined();
  });
  it('parses comma-separated pairs', () => {
    expect(parseNodeSelector('falang.dev/node-role=runners, zone=a')).toEqual({
      'falang.dev/node-role': 'runners',
      zone: 'a',
    });
  });
  it('rejects a malformed pair', () => {
    expect(() => parseNodeSelector('oops')).toThrow(/RUNNER_NODE_SELECTOR/);
    expect(() => parseNodeSelector('=x')).toThrow(/RUNNER_NODE_SELECTOR/);
  });
});

describe('parseTolerations', () => {
  it('is undefined for unset input', () => {
    expect(parseTolerations(undefined)).toBeUndefined();
  });
  it('parses Equal and Exists entries with effects', () => {
    expect(parseTolerations('falang.dev/node-role=runners:NoSchedule, dedicated:NoExecute, any')).toEqual([
      { key: 'falang.dev/node-role', operator: 'Equal', value: 'runners', effect: 'NoSchedule' },
      { key: 'dedicated', operator: 'Exists', effect: 'NoExecute' },
      { key: 'any', operator: 'Exists' },
    ]);
  });
  it('rejects an unknown effect', () => {
    expect(() => parseTolerations('a=b:Bogus')).toThrow(/effect/);
  });
});
