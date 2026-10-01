import { describe, expect, it } from 'vitest';
import { electronNodeCommand } from './electron-node-command.js';

describe('electronNodeCommand', () => {
  it('runs the script with the current binary in Node mode', () => {
    expect(electronNodeCommand('/res/worker/index.js', ['.'], { execPath: '/opt/Falang/falang', env: {} })).toEqual({
      command: '/opt/Falang/falang',
      args: ['/res/worker/index.js', '.'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it('ignores $APPIMAGE for a short-lived command (the mount exists while the app runs)', () => {
    const command = electronNodeCommand('/s.js', [], {
      execPath: '/tmp/.mount_abc/falang',
      env: { APPIMAGE: '/home/u/Falang.AppImage' },
    });
    expect(command.command).toBe('/tmp/.mount_abc/falang');
  });

  it('uses $APPIMAGE for a persistent command, so it survives the app quitting', () => {
    const command = electronNodeCommand('/s.js', [], {
      persistent: true,
      execPath: '/tmp/.mount_abc/falang',
      env: { APPIMAGE: '/home/u/Falang.AppImage' },
    });
    expect(command.command).toBe('/home/u/Falang.AppImage');
  });

  it('falls back to the binary for a persistent command outside an AppImage', () => {
    const command = electronNodeCommand('/s.js', [], {
      persistent: true,
      execPath: String.raw`C:\Falang\Falang.exe`,
      env: {},
    });
    expect(command.command).toBe(String.raw`C:\Falang\Falang.exe`);
  });
});
