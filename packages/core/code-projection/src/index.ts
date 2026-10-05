// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
export * from './types.js';
export * from './type-text.js';
export * from './template-body.js';
export {
  expr,
  indent,
  INDENT,
  JUMP_KINDS,
  MAGIC_START,
  MAGIC_END,
  FOOTER_MARK,
  Projector,
  projectStatements,
  UnsupportedNodeError,
  withOut,
} from './projector.js';
export { createSourceFile, foldOuts, Parser, syntaxDiagnostics, type IParsedList } from './parser.js';
export * from './function-file.js';
export * from './normalize.js';
export * from './match.js';
export * from './apply.js';
export * from './simple-registries.js';
export * from './types-file.js';
