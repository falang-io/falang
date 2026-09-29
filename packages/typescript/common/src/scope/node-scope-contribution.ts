import type { zod } from '@falang/dto';
import type {
  arrPopDto,
  arrSliceDto,
  createVarDto,
  foreachHeaderDto,
  fromToCycleHeaderDto,
  functionBodyDto,
  TVariableInfo,
} from '@falang/typescript-dto';
import { buildArrayElementTypeExpression, buildArrayTypeExpression } from './array-element-type.js';
import type { IScopeVariable } from './scope-variable.js';

/** A `SCOPE_CONTRIBUTORS`-shaped function, registerable at runtime for node kinds this package knows nothing about — see `registerScopeContributor`. */
export type TScopeContributor = (data: unknown) => IScopeVariable | undefined;

/**
 * Minimal shape read from a node — satisfied structurally by both a compiled `INode` (`data?: T`)
 * and a live `NodeStore` (`data: T | null`), so no adapter is needed to call this from either side.
 */
interface IScopeContributionSource {
  readonly name: string;
  readonly data?: unknown;
}

type TCreateVarData = zod.infer<typeof createVarDto>;
/** Shape shared by arr-pop and arr-shift: pull one element out of `arr` into a new `variable`. */
type TArrOpReturningData = zod.infer<typeof arrPopDto>;
type TArrSliceData = zod.infer<typeof arrSliceDto>;
type TFunctionBodyData = zod.infer<typeof functionBodyDto>;
type TForeachHeaderData = zod.infer<typeof foreachHeaderDto>;
type TFromToCycleHeaderData = zod.infer<typeof fromToCycleHeaderDto>;
/**
 * Structural, not imported from `@falang/workflow-dto`'s `TTriggerFunctionBodyData` — this package
 * stays generic (see CLAUDE.md's package layout), so it only reads the two fields it needs off
 * whatever workflow-specific node happens to be named `trigger-function-body`.
 */
interface ITriggerFunctionBodyScopeData {
  readonly scopeVariableName: string;
  readonly scopeType: TVariableInfo;
}

/**
 * Structural, not imported from `@falang/workflow-integrations-common` — same rationale as
 * `ITriggerFunctionBodyScopeData` above. A `call-ai-choice-option` node's `data` (`{alias,
 * dataType, variable}`) contributes a variable, named by the option itself, to ITS OWN children's
 * scope, typed per that option's declared (scalar-only, see `@falang/workflow-compiler`'s
 * `choice-emitters.ts`) type.
 */
interface ICallAiChoiceOptionScopeData {
  readonly dataType: TVariableInfo;
  readonly variable: string;
}

const NUMBER_TYPE = { type: 'number', numberType: { type: 'any' } } as const;

const arrOpReturningContribution = ({ arr, variable }: TArrOpReturningData): IScopeVariable => ({
  name: variable,
  type: { type: 'raw', expression: buildArrayElementTypeExpression(arr), constant: true },
});

/** Registry of node kinds that introduce a variable into their enclosing scope, keyed by node name. */
const SCOPE_CONTRIBUTORS: Record<string, (data: unknown) => IScopeVariable | undefined> = {
  'create-var': (data) => {
    const { name, variableType } = data as TCreateVarData;
    return { name, type: variableType };
  },
  'arr-pop': (data) => arrOpReturningContribution(data as TArrOpReturningData),
  'arr-shift': (data) => arrOpReturningContribution(data as TArrOpReturningData),
  'arr-slice': (data) => {
    const { arr, variable } = data as TArrSliceData;
    return { name: variable, type: { type: 'raw', expression: buildArrayTypeExpression(arr), constant: true } };
  },
};

/**
 * Registry of node kinds that introduce a variable into their enclosing scope, populated at runtime
 * rather than known statically by this package — e.g. `@falang/workflow-scheme`'s `IntegrationsModule`
 * registers one contributor per action with a `kind: 'new-variable'` field (`call-ai-text`'s
 * `resultVariable`, and every other vendor's own result-capturing field), keyed by the node name the
 * action registers under. Kept as a separate `Map` from `SCOPE_CONTRIBUTORS` above rather than merged
 * into it, since that one is a fixed `Record` this package owns outright.
 */
const dynamicScopeContributors = new Map<string, TScopeContributor>();

/**
 * Registers (or re-registers — idempotent by name, last call wins) a scope contributor for a node
 * kind this package knows nothing about by name. See `dynamicScopeContributors`.
 */
export const registerScopeContributor = (nodeName: string, contributor: TScopeContributor): void => {
  dynamicScopeContributors.set(nodeName, contributor);
};

/**
 * Returns the variable a node introduces into its enclosing scope — e.g. `create-var`'s `name`,
 * `arr-pop`/`arr-shift`/`arr-slice`'s result `variable` (typed as a raw `typeof` query derived
 * from their `arr` field, see `array-element-type.ts`), or a dynamically registered contributor (see
 * `registerScopeContributor`) — or `undefined` for node kinds that don't introduce one. Shared between
 * compile-time (`INode`) and editor-time (`NodeStore`) scope walking.
 */
export const getScopeContribution = (node: IScopeContributionSource): IScopeVariable | undefined => {
  if (!node.data) return;
  const contributor = SCOPE_CONTRIBUTORS[node.name] ?? dynamicScopeContributors.get(node.name);
  return contributor?.(node.data);
};

/**
 * Registry of node kinds that introduce variables into the scope of THEIR OWN CHILDREN, keyed by
 * node name — distinct from `SCOPE_CONTRIBUTORS` above, which reads a variable a node contributes
 * to its *siblings'* scope. `function-body` carries its function's parameters directly on itself
 * (see `functionCfg`); `foreach`/`from-to-cycle` (see `cycle()`) carry their loop header — `item`
 * (and `foreach`'s optional `index`) — directly on themselves too, no separate header node exists.
 * `trigger-function-body` (a workflow-domain node kind, see `ITriggerFunctionBodyScopeData` above)
 * likewise carries its bound trigger's payload variable name/type directly on itself.
 * `call-ai-choice-option` similarly carries its own contributed variable's name/type on itself.
 */
const RETURN_VALUE_NAME = 'returnValue';

const CONTAINER_SCOPE_CONTRIBUTORS: Record<string, (data: unknown) => IScopeVariable[]> = {
  'function-body': (data) => {
    const { parameters, returnValue } = data as TFunctionBodyData;
    const variables = parameters.map((param) => ({ name: param.name, type: { ...param.type, constant: true } }));
    // Mirrors `@falang/logic-constructor`'s own `RETURN_VALUE_NAME` (`compile-ts-function.ts`/
    // `compile-rust-function.ts`) — a non-void function's body always has this local auto-declared/
    // auto-returned at compile time, so the editor needs to know about it too even though no DSL node
    // ever introduces it.
    if (returnValue && returnValue.type !== 'void') {
      variables.push({ name: RETURN_VALUE_NAME, type: { ...returnValue, constant: false } });
    }
    return variables;
  },
  foreach: (data) => {
    const { arr, item, index } = data as TForeachHeaderData;
    // `const item of arr` / `const [index, item] of arr.entries()` — both destructured as `const`.
    const variables: IScopeVariable[] = [
      { name: item, type: { type: 'raw', expression: buildArrayElementTypeExpression(arr), constant: true } },
    ];
    if (index.trim() !== '') variables.push({ name: index, type: { ...NUMBER_TYPE, constant: true } });
    return variables;
  },
  'from-to-cycle': (data) => {
    const { item } = data as TFromToCycleHeaderData;
    // `let item = from; item <= to; item++` — mutated by the loop, so not `constant`.
    return [{ name: item, type: { ...NUMBER_TYPE, constant: false } }];
  },
  'trigger-function-body': (data) => {
    const { scopeVariableName, scopeType } = data as ITriggerFunctionBodyScopeData;
    return [{ name: scopeVariableName, type: { ...scopeType, constant: true } }];
  },
  'call-ai-choice-option': (data) => {
    const { dataType, variable } = data as ICallAiChoiceOptionScopeData;
    return [{ name: variable, type: { ...dataType, constant: true } }];
  },
};

/** A `CONTAINER_SCOPE_CONTRIBUTORS`-shaped function, registerable at runtime for node kinds this package knows nothing about — see `registerContainerScopeContributor`. */
export type TContainerScopeContributor = (data: unknown) => IScopeVariable[];

/**
 * Registry of container-scope contributors populated at runtime rather than known statically by
 * this package — e.g. `@falang/workflow-integrations-common`'s `registerQuestionScopeContributors`
 * registers one per question descriptor with an `answerScope`, keyed by that question's own
 * `<name>-option` node kind (ADR 0040 (private)). Kept as a separate `Map` from
 * `CONTAINER_SCOPE_CONTRIBUTORS` above for the same reason `dynamicScopeContributors` is kept
 * separate from `SCOPE_CONTRIBUTORS`.
 */
const dynamicContainerScopeContributors = new Map<string, TContainerScopeContributor>();

/**
 * Registers (or re-registers — idempotent by name, last call wins) a container-scope contributor
 * for a node kind this package knows nothing about by name. See `dynamicContainerScopeContributors`.
 */
export const registerContainerScopeContributor = (nodeName: string, contributor: TContainerScopeContributor): void => {
  dynamicContainerScopeContributors.set(nodeName, contributor);
};

/**
 * Returns the variables a container node introduces into the scope of its own children — a
 * function's parameters, a loop's `item`/`index`, or a dynamically registered contributor (see
 * `registerContainerScopeContributor`) — or `[]` for node kinds that don't introduce any (`while`'s
 * condition, `if`/`switch`/`parallel`, plain statement containers, …).
 */
export const getContainerScopeContribution = (node: IScopeContributionSource): IScopeVariable[] => {
  if (!node.data) return [];
  const contributor = CONTAINER_SCOPE_CONTRIBUTORS[node.name] ?? dynamicContainerScopeContributors.get(node.name);
  return contributor?.(node.data) ?? [];
};
