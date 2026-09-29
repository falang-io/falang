import type { INode } from '@falang/dto';
import type { IActionDescriptor, IFieldConfig, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { escapeTemplateLiteralBody } from './escape-template-literal.js';
import type { TIntegrationEmitters } from './node-emitters.js';
import { asExpression } from './raw-code.js';

/**
 * `'expression'` fields hold raw user-typed code (compiled like any other expression field, e.g.
 * `arr-push`'s `value`) — most other field kinds (`text`/`select`/`credential-ref`)
 * hold an opaque value picked in the editor (an id, a literal choice), not code, so they compile to
 * a string literal. `'template-string'` is a plain string that may contain `${expr}` interpolation
 * (edited via `@falang/typescript-scheme`'s `TemplateStringStore`, same as the `log` block's message),
 * so it compiles to a template literal, not a plain string literal — otherwise `${expr}` would survive
 * into the emitted `"..."` string as dead literal text instead of interpolating. `'result-type'` is
 * data *about* the call (a JSON-encoded restricted `TVariableInfo`), not an argument value at all —
 * it's passed through raw so `IActionDescriptor.emit` can `JSON.parse` it itself to decide what to
 * build (see `call-ai-text`'s `emit`). `'new-variable'` is a bare identifier (e.g. `call-ai-text`'s
 * `resultVariable`) that must appear unquoted on the left of a `const` declaration, so it's passed
 * through raw too, same as `'result-type'`.
 */
export const resolveFieldExpression = (field: IFieldConfig, rawValue: string): string => {
  if (field.kind === 'expression') return asExpression(rawValue);
  if (field.kind === 'template-string') return `\`${escapeTemplateLiteralBody(rawValue)}\``;
  if (field.kind === 'result-type' || field.kind === 'new-variable') return rawValue;
  return JSON.stringify(rawValue);
};

const buildActionEmitter = (action: IActionDescriptor): ((node: INode) => string) => {
  const emitAction = (node: INode): string => {
    const data = (node.data ?? {}) as Readonly<Record<string, string>>;
    const fields: Record<string, string> = {};
    for (const field of action.fields) {
      fields[field.name] = resolveFieldExpression(field, data[field.name] ?? '');
    }
    return action.emit(fields);
  };
  return emitAction;
};

/** One leaf emitter per registered vendor's action node kind — see ADR 0006's "generic field-driven UI, not bespoke DTOs/blocks per action", now extended to codegen. */
export const buildIntegrationEmitters = (integrations: readonly IWorkflowIntegration[]): TIntegrationEmitters => {
  const emitters: Record<string, (node: INode) => string> = {};
  for (const integration of integrations) {
    for (const action of integration.actions) {
      emitters[action.name] = buildActionEmitter(action);
    }
  }
  return emitters;
};
