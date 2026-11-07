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
      singleUser: false,
      services: [],
      testMode: false,
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
        '--single-user',
        '--with',
        'mailpit,media',
        '--test-mode',
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
      singleUser: true,
      services: ['mailpit', 'media'],
      testMode: true,
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

  it('parses --with: repeatable, deduplicated, empty items ignored, unknown names rejected', () => {
    expect(parseLocalCliArgs(['--with', 'media, mailpit,', '--with', 'media,activepieces'], '/d').services).toEqual([
      'media',
      'mailpit',
      'activepieces',
    ]);
    expect(parseLocalCliArgs(['--with', ''], '/d').services).toEqual([]);
    expect(() => parseLocalCliArgs(['--with', 'mailpit,redis'], '/d')).toThrow('Unknown service "redis" in --with');
    expect(() => parseLocalCliArgs(['--with'], '/d')).toThrow('--with needs a value');
  });
});
