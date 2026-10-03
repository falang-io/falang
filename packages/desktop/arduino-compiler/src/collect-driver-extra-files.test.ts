import { describe, expect, it } from 'vitest';
import type { ILoadedDriver } from '@falang/desktop-arduino-dto';
import { collectDriverExtraFiles } from './collect-driver-extra-files.js';

const driver = (id: string): ILoadedDriver => ({
  config: { actions: [], declarations: [], id, includes: [], label: id, sourceFiles: [`${id}.h`, `${id}.cpp`] },
  dir: `/drivers/${id}`,
});

describe('collectDriverExtraFiles', () => {
  it('ships only the used drivers’ source files, as absolute paths under each driver folder', () => {
    const files = collectDriverExtraFiles([driver('a'), driver('b')], new Set(['b']));
    expect(files).toEqual([
      { relativePath: 'b.h', sourcePath: '/drivers/b/b.h' },
      { relativePath: 'b.cpp', sourcePath: '/drivers/b/b.cpp' },
    ]);
  });
});
