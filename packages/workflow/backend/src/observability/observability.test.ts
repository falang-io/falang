import { describe, expect, it } from 'vitest';
import { RequestAwareJsonLogger, parseLogLevels } from './json-logger.js';
import { resolveRequestId, runWithRequestContext } from './request-context.js';

describe('resolveRequestId', () => {
  it('keeps a valid incoming id and replaces anything else', () => {
    expect(resolveRequestId('abc-123_X.y')).toBe('abc-123_X.y');
    expect(resolveRequestId('a'.repeat(129))).not.toBe('a'.repeat(129));
    expect(resolveRequestId('bad id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('parseLogLevels', () => {
  it('treats one level as a minimum and a list as exact', () => {
    expect(parseLogLevels('warn')).toEqual(['warn', 'error', 'fatal']);
    expect(parseLogLevels('log, error')).toEqual(['log', 'error']);
    expect(parseLogLevels('nonsense')).toBeNull();
    expect(parseLogLevels(null)).toBeNull();
  });
});

const capture = (fn: () => void): string[] => {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return lines;
};

describe('RequestAwareJsonLogger', () => {
  it('writes one JSON object per line and adds requestId only inside a request', () => {
    const logger = new RequestAwareJsonLogger({ json: true, colors: false, compact: true });
    const outside = capture(() => logger.log('multi\nline message', 'Ctx'));
    const inside = capture(() => runWithRequestContext({ requestId: 'req-1' }, () => logger.log('hello', 'Ctx')));
    expect(outside).toHaveLength(1);
    expect(outside[0]?.endsWith('\n')).toBe(true);
    expect(outside[0]?.trimEnd().includes('\n')).toBe(false);
    const parsedOutside = JSON.parse(outside[0] ?? '{}') as Record<string, unknown>;
    expect(parsedOutside).toMatchObject({ level: 'log', message: 'multi\nline message', context: 'Ctx' });
    expect(parsedOutside.requestId).toBeUndefined();
    expect(JSON.parse(inside[0] ?? '{}')).toMatchObject({ message: 'hello', requestId: 'req-1' });
  });
});
