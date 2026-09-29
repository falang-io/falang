import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * One extra file to place inside the sketch directory alongside the `.ino`, either written from
 * in-memory `content` (e.g. a debug build's generated `falang_debug.h`, see ADR 0021 (private) §6)
 * or copied from an existing `sourcePath` on disk (e.g. a device driver's own `.h`/`.cpp` files, see
 * ADR 0023 (private)'s Phase B/C) — `arduino-cli`/the Arduino IDE both pick up any file that sits
 * alongside the `.ino` automatically, no manifest needed, so `writeSketchFiles` only needs to know how
 * to get each file's bytes onto disk, not why it's there.
 */
export type ISketchExtraFile =
  | { readonly relativePath: string; readonly content: string }
  | { readonly relativePath: string; readonly sourcePath: string };

const writeExtraFile = async (sketchDir: string, file: ISketchExtraFile): Promise<void> => {
  const destPath = path.join(sketchDir, file.relativePath);
  await ('content' in file ? fs.writeFile(destPath, file.content) : fs.copyFile(file.sourcePath, destPath));
};

/**
 * `arduino-cli` requires a sketch's folder name and its main `.ino` file's basename to match exactly —
 * writes `<buildDir>/<sketchName>/<sketchName>.ino` and returns that sketch directory for
 * `compileSketch`/`uploadSketch`. This package stays agnostic of *why* an extra file is needed (see
 * ADR 0002 (private)'s package-layout reasoning) — it only knows "write/copy these extra files into
 * the sketch dir too."
 *
 * The sketch directory is removed and recreated on every call (ADR 0032 (private) §4) rather than
 * just overwritten in place: `arduino-cli` compiles *every* file it finds inside the sketch folder, so a
 * driver `.cpp`/`.h` left over from a device or action removed since the previous build would otherwise
 * still get built in, even though nothing in the current `code`/`extraFiles` references it anymore.
 */
export const writeSketchFiles = async (
  buildDir: string,
  sketchName: string,
  code: string,
  extraFiles: readonly ISketchExtraFile[] = [],
): Promise<string> => {
  const sketchDir = path.join(buildDir, sketchName);
  await fs.rm(sketchDir, { recursive: true, force: true });
  await fs.mkdir(sketchDir, { recursive: true });
  await fs.writeFile(path.join(sketchDir, `${sketchName}.ino`), code);
  for (const file of extraFiles) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of small extra files per build; sequential keeps this simple and errors attributable to one file.
    await writeExtraFile(sketchDir, file);
  }
  return sketchDir;
};
