import { describe, expect, it } from 'vitest';
import { buildMailpitArgs, buildMailpitAsset, buildMailpitEnv, MAILPIT_VERSION } from './mailpit.js';

describe('mailpit service', () => {
  it('builds the pinned release asset per platform, with its checksum', () => {
    const linux = buildMailpitAsset('linux', 'x64');
    expect(linux.url).toBe(
      `https://github.com/axllent/mailpit/releases/download/v${MAILPIT_VERSION}/mailpit-linux-amd64.tar.gz`,
    );
    expect(linux.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(linux.binaryPathInArchive).toBe('mailpit');
    expect(buildMailpitAsset('darwin', 'arm64').fileName).toBe('mailpit-darwin-arm64.tar.gz');
    const win = buildMailpitAsset('win32', 'x64');
    expect(win.fileName).toBe('mailpit-windows-amd64.zip');
    expect(win.binaryPathInArchive).toBe('mailpit.exe');
    const all = ['linux', 'darwin', 'win32'].flatMap((os) =>
      ['x64', 'arm64'].map((arch) => buildMailpitAsset(os as NodeJS.Platform, arch).sha256),
    );
    expect(new Set(all).size).toBe(6);
  });

  it('rejects platforms without a prebuilt binary', () => {
    expect(() => buildMailpitAsset('freebsd', 'x64')).toThrow(/No prebuilt mailpit/);
    expect(() => buildMailpitAsset('linux', 'ia32')).toThrow(/No prebuilt mailpit/);
  });

  it('binds SMTP and HTTP to loopback, optionally with a database file', () => {
    const args = buildMailpitArgs({ smtpPort: 1025, httpPort: 8025, databaseFile: null });
    expect(args).toEqual([
      '--smtp',
      '127.0.0.1:1025',
      '--listen',
      '127.0.0.1:8025',
      '--smtp-auth-accept-any',
      '--smtp-auth-allow-insecure',
      '--smtp-disable-rdns',
    ]);
    expect(buildMailpitArgs({ smtpPort: 1, httpPort: 2, databaseFile: '/d/mailpit.db' }).slice(-2)).toEqual([
      '--database',
      '/d/mailpit.db',
    ]);
  });

  it('hands the backend SMTP_URL/MAIL_FROM and the tests MAILPIT_URL', () => {
    expect(buildMailpitEnv(1025, 8025)).toEqual({
      backendEnv: { SMTP_URL: 'smtp://127.0.0.1:1025', MAIL_FROM: 'noreply@falang.local' },
      testEnv: { MAILPIT_URL: 'http://127.0.0.1:8025' },
    });
  });
});
