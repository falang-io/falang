export {
  ArduinoProjectCompileError,
  compileArduinoProject,
  FALANG_DEBUG_HEADER_FILENAME,
  type IArduinoProjectCompileErrorEntry,
  type ICompileArduinoProjectParams,
  type ICompileArduinoProjectResult,
} from './compile-arduino-project.js';
export { buildFalangDebugHeader } from './falang-debug-header.js';
export { collectDriverExtraFiles } from './collect-driver-extra-files.js';
export { validateDriverBundle } from './validate-driver-bundle.js';
export { findDriverUsages } from './driver-usages.js';
export type {
  IDriverCliCheckResult,
  IDriverUsage,
  IDriverValidationIssue,
  IDriverValidationProject,
  IDriverValidationResult,
  IValidateDriverBundleContext,
  TDriverValidationStage,
} from './driver-validation-types.js';
export {
  classifyCliFailure,
  createArduinoCliDriverCheck,
  type ICliCompileOutcome,
  type ICreateArduinoCliDriverCheckParams,
} from './cli-driver-check.js';
