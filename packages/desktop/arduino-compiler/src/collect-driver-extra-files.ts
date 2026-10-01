import * as path from 'node:path';
import type { ISketchExtraFile } from '@falang/desktop-arduino-cli';
import type { ILoadedDriver } from '@falang/desktop-arduino-dto';

/**
 * The used drivers' own `sourceFiles` (headers + `.cpp`), resolved to absolute source paths — what `writeSketchFiles`
 * copies next to the `.ino` (ADR 0023 (private), Phase B/C "Artifact delivery"). `usedDriverIds` is
 * `compileArduinoProject`'s result; unused drivers' files are never shipped.
 */
export const collectDriverExtraFiles = (
  drivers: readonly ILoadedDriver[],
  usedDriverIds: ReadonlySet<string>,
): ISketchExtraFile[] =>
  drivers
    .filter((driver) => usedDriverIds.has(driver.config.id))
    .flatMap((driver) =>
      driver.config.sourceFiles.map((fileName) => ({
        relativePath: fileName,
        sourcePath: path.join(driver.dir, fileName),
      })),
    );
