import { nanoid } from 'nanoid';
import type { INode } from '@falang/dto';
import { defaultValueExpression, type TTypeInfo } from '@falang/typescript-dto';
import { convertBodyAndExit, type IConvertContext } from './convert-common.js';
import { convertExpression } from './convert-expression.js';
import { convertVariableInfo } from './variable-type.js';
import type { IOldBlock, IOldCallBlock, IOldIcon } from './old-types.js';

/** Small statement/expression-level helpers for the `logic` domain, split out from `convert-logic-project.ts` purely to keep that file under `oxlint`'s `max-lines` — same reasoning `packages/logic/e2e-tests/src/arrays-project-builders.ts` documents. */

export const RETURN_VALUE_VAR = 'returnValue';

export const expressionText = (block: IOldBlock | undefined, id: string): string => {
  if (typeof block?.expression !== 'string')
    throw new Error(`Old logic-domain node ${id} is missing "block.expression"`);
  return block.expression;
};

/** `create_var`/`assign_var`'s `expression` is `"name = value"`, or just `"name"` with no initializer. */
const splitAssignment = (expression: string): { name: string; value?: string } => {
  const match = /^(.+?)\s*=\s*(.+)$/.exec(expression);
  if (!match) return { name: expression.trim() };
  return { name: match[1].trim(), value: match[2].trim() };
};

/**
 * Old `log`'s `expression` is a quoted string-literal-with-`{var}`-interpolation (e.g.
 * `"\"Pop from array: {z}\""` or `"'Calculation result: {resultPi}'"`), while the new `log` node's
 * `data` is the bare template body with `${var}` interpolation (e.g. `'Pop from array: ${z}'`) — no
 * surrounding quotes. Confirmed against `packages/logic/e2e-tests/src/*-project.fixture.ts`'s
 * manually-converted `log(...)` calls for these exact old strings. Each `{...}` interpolation body is
 * itself an old-app (mathjs) expression, so it goes through `convertExpression` the same as any other
 * expression-typed field — a no-op for the common case of a bare variable name.
 */
export const convertLogTemplate = (expression: string): string => {
  const trimmed = expression.trim();
  const quote = trimmed[0];
  const isQuoted = (quote === '"' || quote === "'") && trimmed.length >= 2 && trimmed.endsWith(quote);
  const body = isQuoted ? trimmed.slice(1, -1) : trimmed;
  return body.replaceAll(/\{([^{}]+)\}/g, (_match, inner: string) => `\${${convertExpression(inner)}}`);
};

/**
 * Restores the old app-wide convention documented in ADR 0005 (private)'s
 * "Implementation notes (old-format project migration)": a `return` never carried its own
 * expression — a preceding `assign_var{"returnValue = X"}` (by then already converted to a plain
 * `action` node) set the value, and codegen always emitted `return returnValue;`. The new `return`
 * node takes an expression directly, so that preceding assignment is dropped and `X` inlined —
 * same simplification ADR 0019 (private)'s `conditions-project.fixture.ts` made by hand.
 *
 * A `return` with no directly preceding `returnValue = ...` assignment on its own path is a
 * *normal* form of this convention too, not a converter bug: the old app always pre-declared
 * `returnValue` with a type-appropriate default value at function entry (old `ts/generateEmptyValue.ts`
 * and every other language's identically-shaped codegen helper), so a branch that never reassigns it
 * before returning legitimately falls back to that default — reusing `@falang/typescript-dto`'s own
 * `defaultValueExpression` (already used for `create-var`'s own no-initializer default) rather than
 * a second copy of the same per-type literal table. `returnType` (`null` for a void/no-return
 * function, matching the old "nothing to recover" case) is only consulted for that fallback.
 */
export const mergeTrailingReturnValueAssignment = (
  children: INode[],
  returnType: TTypeInfo | null,
  nodeId: string,
): { children: INode[]; data: string } => {
  const last = children.at(-1);
  if (last?.name === 'action' && typeof last.data === 'string') {
    const match = new RegExp(`^${RETURN_VALUE_VAR}\\s*=\\s*(.+)$`).exec(last.data);
    if (match) return { children: children.slice(0, -1), data: match[1].trim() };
  }
  if (!returnType) return { children, data: '' };
  const fallback = defaultValueExpression(returnType);
  if (!fallback)
    throw new Error(
      `Old "return" near node ${nodeId} has a non-void return value of type "${returnType.type}" but no preceding ` +
        `"${RETURN_VALUE_VAR} = ..." assignment was found, and no default value exists for that type`,
    );
  return { children, data: fallback };
};

/**
 * The top-level, function-body-closing counterpart of `mergeTrailingReturnValueAssignment` — for a
 * non-void function whose flow naturally reaches the end of its body (no explicit `out{type:
 * 'return'}` there at all, e.g. old MonteCarlo's `calculateMonteCarlo`, which sets `returnValue`
 * as its very last statement with no trailing out-node), appends an explicit `return` (the new
 * model has no implicit fallthrough return, unlike the old one).
 *
 * Unlike `mergeTrailingReturnValueAssignment`, this does **not** throw when no matching trailing
 * assignment is found — a non-void function's top-level flow legitimately has no such assignment
 * when every path returns early from a nested branch instead (confirmed against
 * `packages/logic/e2e-tests/src/conditions-project.fixture.ts`'s own `TestReturn`, whose body ends
 * with a bare `from-to-cycle` and no synthetic fallback return — `@falang/logic-constructor`
 * compiles that fine, matching every real target language's tolerance for an unreachable-in-practice
 * missing return).
 */
export const finalizeFunctionBody = (statements: INode[], hasReturnValue: boolean): INode[] => {
  if (!hasReturnValue) return statements;
  const last = statements.at(-1);
  if (last?.name !== 'action' || typeof last.data !== 'string') return statements;
  const match = new RegExp(`^${RETURN_VALUE_VAR}\\s*=\\s*(.+)$`).exec(last.data);
  if (!match) return statements;
  return [...statements.slice(0, -1), { id: nanoid(), name: 'return', data: match[1].trim() }];
};

const convertCreateVar = (old: IOldIcon): INode => {
  const block = old.block;
  if (!block?.expression) throw new Error(`Old "create_var" node ${old.id} is missing "block.expression"`);
  if (!block.variableType) throw new Error(`Old "create_var" node ${old.id} is missing "block.variableType"`);
  const { name, value } = splitAssignment(block.expression);
  return {
    id: old.id,
    name: 'create-var',
    data: {
      name,
      variableType: convertVariableInfo(block.variableType),
      ...(typeof value === 'string' ? { value: convertExpression(value) } : {}),
    },
  };
};

/**
 * Old `call_function`/`call_api`'s own `block.schemeId` is **not** the target document's own id —
 * it is the target old *document's root icon's* id (`IOldScheme.root.id`), confirmed against every
 * real `call_function`/`call_api` node in a real converted project (`~/Work/example-snake`) and
 * against this package's own `api`/`objects`/`arrays` fixtures: every referenced value equals some
 * sibling document's `root.id`, never its `scheme.id`, and the two id spaces never overlap. The new
 * `call-function`/`call-api` node's `data.schemeId` is expected to be the *new document's own id*
 * (which this converter always sets equal to the old `scheme.id`, see `convertFunctionDocument`/
 * `convertExternalApiStructureDocument`) — that's what `FunctionsRegistryStore`/
 * `ExternalApiRegistryStore` key their entries by (`doc.id`, see `desktop-project-store.ts`'s
 * `syncFunctionsRegistry`/`syncExternalApiRegistry`). `rootIdToDocumentId` (built project-wide in
 * `convertOldProject`, since a call can target any document anywhere in the tree) bridges the two id
 * spaces; a `schemeId` with no entry means the old project references a document this converter
 * never saw (a genuinely dangling reference, not a converter bug) and is surfaced as an error rather
 * than silently carried over as an id nothing will ever resolve.
 */
const convertCall = (
  old: IOldIcon,
  name: 'call-function' | 'call-api',
  rootIdToDocumentId: ReadonlyMap<string, string>,
): INode => {
  const block = old.block as unknown as IOldCallBlock | undefined;
  if (!block?.schemeId) throw new Error(`Old "${old.alias}" node ${old.id} is missing "block.schemeId"`);
  const schemeId = rootIdToDocumentId.get(block.schemeId);
  if (!schemeId)
    throw new Error(
      `Old "${old.alias}" node ${old.id} references document root "${block.schemeId}", which was not found ` +
        `among the converted project's documents`,
    );
  return {
    id: old.id,
    name,
    data: {
      schemeId,
      iconId: block.iconId ?? null,
      parameters: (block.parameters ?? []).map((parameter) => convertExpression(parameter)),
      returnVariable: block.returnVariable ?? '',
    },
  };
};

/** `arr_push`/`arr_unshift`'s old `variable` field is the value expression being pushed (renamed `value` in the new DTO, and converted like any other expression); `arr_pop`/`arr_shift`'s is the *result variable name* (kept as `variable`, and — like `returnVariable` above — never run through `convertExpression`, since it's an identifier, not an expression). `arr` (the array itself) is always an expression (typically a member-access chain, e.g. `state.snake.body`), so it's always converted. */
const convertArrOp = (old: IOldIcon, name: string, valueField: 'value' | 'variable'): INode => {
  const block = old.block;
  if (!block?.arr) throw new Error(`Old "${old.alias}" node ${old.id} is missing "block.arr"`);
  if (typeof block.variable !== 'string')
    throw new Error(`Old "${old.alias}" node ${old.id} is missing "block.variable"`);
  const value = valueField === 'value' ? convertExpression(block.variable) : block.variable;
  return { id: old.id, name, data: { arr: convertExpression(block.arr), [valueField]: value } };
};

/** Old `from_to_cycle` is exclusive of `to` (`item < to`); the new `from-to-cycle` is inclusive (`item <= to`) — appending `" - 1"` reproduces the same iteration count/range. Confirmed against every `fromToCycle(...)` call in `packages/logic/e2e-tests/src/{arrays,conditions,montecarlo}-project.fixture.ts`. `from`/`to` are converted expressions; `item` (the loop variable's name) is an identifier and is left untouched. */
const convertFromToCycle = (old: IOldIcon, ctx: IConvertContext): INode => {
  const block = old.block;
  if (typeof block?.from !== 'string' || typeof block.to !== 'string' || typeof block.item !== 'string')
    throw new Error(`Old "from_to_cycle" node ${old.id} is missing "from"/"to"/"item"`);
  const { children, out } = convertBodyAndExit(old.children, old.out, ctx, 'from-to-cycle');
  return {
    id: old.id,
    name: 'from-to-cycle',
    data: { from: convertExpression(block.from), to: `${convertExpression(block.to)} - 1`, item: block.item },
    children,
    ...(out ? { out } : {}),
  };
};

export const convertLogicLeaf = (
  old: IOldIcon,
  ctx: IConvertContext,
  rootIdToDocumentId: ReadonlyMap<string, string>,
): INode => {
  switch (old.alias) {
    case 'create_var': {
      return convertCreateVar(old);
    }
    case 'assign_var':
    case 'action': {
      return { id: old.id, name: 'action', data: convertExpression(expressionText(old.block, old.id)) };
    }
    case 'log': {
      return { id: old.id, name: 'log', data: convertLogTemplate(expressionText(old.block, old.id)) };
    }
    case 'call_function': {
      return convertCall(old, 'call-function', rootIdToDocumentId);
    }
    case 'call_api': {
      return convertCall(old, 'call-api', rootIdToDocumentId);
    }
    case 'arr_push': {
      return convertArrOp(old, 'arr-push', 'value');
    }
    case 'arr_unshift': {
      return convertArrOp(old, 'arr-unshift', 'value');
    }
    case 'arr_pop': {
      return convertArrOp(old, 'arr-pop', 'variable');
    }
    case 'arr_shift': {
      return convertArrOp(old, 'arr-shift', 'variable');
    }
    case 'from_to_cycle': {
      return convertFromToCycle(old, ctx);
    }
    default: {
      throw new Error(`Unsupported old icon alias for a logic-domain project: "${old.alias}" (node ${old.id})`);
    }
  }
};

export const createLogicContext = (
  returnType: TTypeInfo | null,
  rootIdToDocumentId: ReadonlyMap<string, string>,
): IConvertContext => ({
  // Shared by `if`/`switch`/switch-option/`while`/`throw` — every use is an old-app (mathjs)
  // condition/case/message expression, so it goes through `convertExpression` uniformly.
  conditionText: (block, id) => convertExpression(expressionText(block, id)),
  foreachData: (block, id) => {
    if (typeof block?.arr !== 'string' || typeof block.item !== 'string' || typeof block.index !== 'string')
      throw new Error(`Old "foreach" node ${id} is missing "arr"/"item"/"index"`);
    // `arr` is the iterated array expression (e.g. `state.snake.body`); `item`/`index` are the loop
    // variables' *names* and are left untouched, same as `from-to-cycle`'s `item` above.
    return { arr: convertExpression(block.arr), item: block.item, index: block.index };
  },
  finalizeReturn: (children, out) => mergeTrailingReturnValueAssignment(children, returnType, out.id),
  convertLeaf: (old, ctx) => convertLogicLeaf(old, ctx, rootIdToDocumentId),
});

/** A nested `system`-wrapper icon's `.header`/root's own `.block` used as a mind-tree header/thread label — old data is inconsistent about whether this is a flat `BlockDto` or a full icon wrapping one (see ADR 0005 (private)'s "Implementation notes"). */
export const iconOrBlockText = (value: { text?: string; block?: IOldBlock } | undefined): string =>
  value?.text ?? value?.block?.text ?? '';
