// oxlint-disable unicorn/no-await-expression-member, init-declarations, no-bitwise, unicorn/no-array-sort, no-undefined, no-void
import { describe, expect, it } from 'vitest';
import { parseLocalCliArgs } from './cli-args.js';

describe('parseLocalCliArgs', () => {
  it('returns defaults for no arguments', () => {
    expect(parseLocalCliArgs([], '/d')).toEqual({
      dataDir: '/d',
      openBrowser: true,
      temporalUi: true,
      skipClient: false,
    });
  });

  it('parses every flag', () => {
    const args = parseLocalCliArgs(
      [
        '--data-dir',
        '/x',
        '--port',
        '8080',
        '--internal-port',
        '0',
        '--client-dir',
        '/c',
        '--skip-client',
        '--no-browser',
        '--no-ui',
        '--status-file',
        '/s.json',
      ],
      '/d',
    );
    expect(args).toEqual({
      dataDir: '/x',
      port: 8080,
      internalPort: 0,
      clientDir: '/c',
      skipClient: true,
      openBrowser: false,
      temporalUi: false,
      statusFile: '/s.json',
    });
  });

  it('throws on an unknown flag or a missing value', () => {
    expect(() => parseLocalCliArgs(['--nope'], '/d')).toThrow('Unknown argument "--nope"');
    expect(() => parseLocalCliArgs(['--port'], '/d')).toThrow('--port needs a value');
  });

  it('rejects a non-numeric or out-of-range port', () => {
    expect(() => parseLocalCliArgs(['--port', 'abc'], '/d')).toThrow('--port must be a port number');
    expect(() => parseLocalCliArgs(['--internal-port', '70000'], '/d')).toThrow(
      '--internal-port must be a port number',
    );
    expect(parseLocalCliArgs(['--port', '0'], '/d').port).toBe(0);
  });
});
