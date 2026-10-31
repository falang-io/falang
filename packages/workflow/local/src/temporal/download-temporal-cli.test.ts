import { describe, expect, it } from 'vitest';
import { buildExtractCommand, buildTemporalCliAsset } from './download-temporal-cli.js';

describe('temporal cli download', () => {
  it('builds asset names per platform', () => {
    expect(buildTemporalCliAsset('1.7.1', 'linux', 'x64').url).toBe(
      'https://github.com/temporalio/cli/releases/download/v1.7.1/temporal_cli_1.7.1_linux_amd64.tar.gz',
    );
    expect(buildTemporalCliAsset('1.7.1', 'darwin', 'arm64').fileName).toBe('temporal_cli_1.7.1_darwin_arm64.tar.gz');
    const win = buildTemporalCliAsset('1.7.1', 'win32', 'x64');
    expect(win.fileName).toBe('temporal_cli_1.7.1_windows_amd64.zip');
    expect(win.binaryName).toBe('temporal.exe');
  });
  it('rejects unsupported platforms', () => {
    expect(() => buildTemporalCliAsset('1.7.1', 'freebsd', 'x64')).toThrow(/No prebuilt/);
  });
  it('assembles the extract command', () => {
    expect(buildExtractCommand('/t/a.tar.gz', '/t/out')).toEqual({
      command: 'tar',
      args: ['-xf', '/t/a.tar.gz', '-C', '/t/out'],
    });
  });
});
