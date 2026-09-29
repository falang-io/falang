import { runArduinoCli, type IArduinoCliResult } from './run-arduino-cli.js';

export interface ICompileSketchParams {
  readonly sketchDir: string;
  readonly fqbn: string;
}

export const compileSketch = ({ sketchDir, fqbn }: ICompileSketchParams): Promise<IArduinoCliResult> =>
  runArduinoCli(['compile', '--fqbn', fqbn, sketchDir]);
