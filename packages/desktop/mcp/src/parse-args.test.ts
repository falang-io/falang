import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildArduinoDriversDirs, parseArgs, splitEnvDirs } from './parse-args.js';

describe('parseArgs', () => {
  it('takes the first positional as the project dir and collects every --drivers-dir', () => {
    expect(parseArgs(['.', '--drivers-dir', 'a', '--drivers-dir', '/b'])).toEqual({
      projectDirArg: '.',
      driversDirs: ['a', '/b'],
    });
  });
});

describe('splitEnvDirs', () => {
  it('splits on the platform delimiter, keeping Windows drive letters intact', () => {
    expect(splitEnvDirs(String.raw`C:\a;D:\b`, ';')).toEqual([String.raw`C:\a`, String.raw`D:\b`]);
    expect(splitEnvDirs('/a: /b :', ':')).toEqual(['/a', '/b']);
    expect(splitEnvDirs('')).toEqual([]);
  });
});

describe('--library-drivers-dir / buildArduinoDriversDirs', () => {
  it('reads the library dir', () => {
    expect(parseArgs(['.', '--drivers-dir', 'a', '--library-drivers-dir', '/lib']).libraryDriversDir).toBe('/lib');
    expect(parseArgs(['.']).libraryDriversDir).toBeUndefined();
  });

  it('orders env, bundled, library, then the project drivers last', () => {
    expect(
      buildArduinoDriversDirs({ projectDir: '/p', envDirs: ['/e'], driversDirs: ['/b'], libraryDriversDir: '/lib' }),
    ).toEqual(['/e', '/b', '/lib', path.join('/p', 'falang', 'drivers')]);
  });
});
