import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IWorkflowIntegration } from './types.js';

/**
 * Structurally identical to `@falang/typescript-common`'s `TScopeContributor`
 * (`(data: unknown) => IScopeVariable | undefined`, where `IScopeVariable.type` is
 * `TVariableInfo | IRawVariableType`) — a function returning `{ name, type: TVariableInfo } | undefined`
 * is assignable to it with no adapter needed. Declared structurally here rather than imported so this
 * package doesn't gain a `@falang/typescript-common` dependency just for one type alias: both
 * `@falang/workflow-scheme` (the editor) and `@falang/workflow-compiler` (debug instrumentation —
 * `packages/workflow/compiler/src/node-emitters.ts`'s `getScopeContribution` call) need this, and
 * neither is a package the other should depend on.
 */
export type TActionScopeContributor = (
  data: unknown,
) => { readonly name: string; readonly type: TVariableInfo } | undefined;

/**
 * Builds a scope contributor for one action, or `undefined` when the action has no
 * `kind: 'new-variable'` field to contribute at all (most vendor actions today: no result captured
 * anywhere). The contributor reads the node's own `data` (a plain `Record<fieldName, string>` — see
 * `@falang/workflow-scheme`'s `IntegrationActionEditorStore`'s `TIntegrationActionData`, which is
 * exactly what an `integration-action` node's `data` holds, keyed by field name, no wrapper) — empty
 * for a node created but never edited yet, in which case nothing is contributed (same "wait until
 * it's actually usable" rule `call-ai-text`'s own former hardcoded contributor used).
 *
 * Typed as `Readonly<Record<string, string>>` because that's both `TIntegrationActionData` and what
 * `IActionDescriptor.resultType`'s function form (and `IFieldConfig.expectedType`'s) already expects.
 */
export const buildActionScopeContributor = (action: IActionDescriptor): TActionScopeContributor | undefined => {
  const resultField = action.fields.find((field) => field.kind === 'new-variable');
  if (!resultField) return;

  return (data) => {
    const fields = data as Readonly<Record<string, string>>;
    const variableName = fields[resultField.name];
    if (!variableName) return;
    const resolvedType = typeof action.resultType === 'function' ? action.resultType(fields) : action.resultType;
    return { name: variableName, type: resolvedType ?? { type: 'any' } };
  };
};

/**
 * Registers every action's scope contributor (see `buildActionScopeContributor`) across a whole set
 * of vendor integrations, keyed by the node name the action itself is registered under (`action.name`
 * — see `@falang/workflow-scheme`'s `integration-nodes-icons-group.ts`). A pure function over
 * `register` rather than calling `@falang/typescript-common`'s `registerScopeContributor` directly, so
 * this package stays free of that dependency — both call sites (`IntegrationsModule.register()` in
 * the editor, `compileProject` in the compiler) pass their own `registerScopeContributor` import in.
 */
export const registerIntegrationScopeContributors = (
  integrations: readonly IWorkflowIntegration[],
  register: (nodeName: string, contributor: TActionScopeContributor) => void,
): void => {
  for (const integration of integrations) {
    for (const action of integration.actions) {
      const contributor = buildActionScopeContributor(action);
      if (contributor) register(action.name, contributor);
    }
  }
};
