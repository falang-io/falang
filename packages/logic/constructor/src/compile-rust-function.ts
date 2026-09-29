import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileRustStatementList } from './compile-rust-statements.js';
import type { IRustCompileParams } from './rust-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { isRustByRefType, variableInfoToRustParamType, variableInfoToRustType } from './rust-type-name.js';
import { indentLines } from './indent.js';
import { getFunctionSignature, type IFunctionBodyParameter } from './function-signature.js';

/** The trailing parameter every compiled function gets unconditionally (ADR 0019 (private)'s "Rust target — old-app layout" implementation notes) — dependency injection for `call-api`, threaded even through a function that never calls one, since Rust has no optional/variadic parameters this could be conditional on. */
const APIS_PARAM = '_apis: &mut dyn crate::falang::falang_global::Apis';

/**
 * Builds a `pub fn <rustName>(<params>, _apis: &mut dyn crate::falang::falang_global::Apis) -> <returnType> {`
 * header — like Go (and unlike cpp's `buildCppSignatureLine`), no forward-declaration counterpart is
 * needed: Rust resolves every module-level item (functions, structs) regardless of textual declaration
 * order, so `compile-rust-project.ts` never needs a prototypes pass. A `void`-returning function omits
 * the return type entirely (Rust's implicit `-> ()` already means the same thing). `pub` is required
 * now (unlike the old single-file design): every function document compiles to its own module file, and
 * both other generated files and the hand-written host crate call across that module boundary.
 *
 * Parameter mutability/ownership split by DSL type kind (ADR 0019 (private)'s "Rust target —
 * old-app layout"): a struct/array parameter is `&<Type>` (borrowed, never `mut` — the *pointee* is
 * never locally reassigned, only read or `.clone()`d, see `rust-leaf-emitters.ts`'s `toOwnedRustValue`);
 * a scalar (`number`/`boolean`/`string`) parameter stays `mut <name>: <Type>` (owned by value) — a
 * parameter's own local mutability is independent of whether the *caller's* value can be observed
 * changing (Rust only permits `let mut`/`fn(mut x: T)` bindings to be reassigned or mutated locally,
 * never the caller's own variable unless a `&mut` reference is used, which no scalar parameter here is),
 * so `mut` is always safe to add unconditionally rather than analyzing each function body for which
 * parameters actually get reassigned.
 */
export const buildRustSignatureLine = (
  rustName: string,
  parameters: readonly IFunctionBodyParameter[],
  returnValue: TVariableInfo | undefined,
  structNames: ReadonlyMap<string, string>,
  structDocuments: ReadonlyMap<string, string>,
): string => {
  const rustParams = parameters.map((parameter) => {
    const type = variableInfoToRustParamType(parameter.type, structNames, structDocuments);
    return isRustByRefType(parameter.type) ? `${parameter.name}: ${type}` : `mut ${parameter.name}: ${type}`;
  });
  const returnType = returnValue ? ` -> ${variableInfoToRustType(returnValue, structNames, structDocuments)}` : '';
  return `pub fn ${rustName}(${[...rustParams, APIS_PARAM].join(', ')})${returnType}`;
};

/**
 * The auto-managed local a non-void function's body mutates instead of always returning explicitly —
 * ported from the old app's own convention, the same "Rust target — old-app layout" fix as
 * `compile-ts-function.ts`'s identically-named `RETURN_VALUE_NAME` (Contract 4's TS-target twin, see
 * that file's own doc comment): a real, previously-latent gap found only by compiling the user's own
 * `example-snake` project — `getNextPoint`/`getColors`/`getRandomPoint`/`getNewFoodPoint` all mutate
 * `returnValue.x = ...`/`returnValue.y = ...` fields with **no `create-var` and no explicit `return`
 * node at all**, the old app's own convention for "build up the return value in place, implicitly
 * returned." Declared with `Default::default()` up front (every type this compiler ever produces a
 * value of derives/implements `Default`, see `emit-rust-struct-declarations.ts`) and unconditionally
 * returned at the very end of the compiled body — this coexists with an explicit `return <expr>` DSL
 * node earlier in the body (`isGameOver`'s own early returns compile normally through
 * `rust-return-emitter.ts`'s `emitReturn`), since an earlier `return` simply exits before the trailing
 * `return returnValue;` is ever reached; the dead code past it is an `unreachable_code` *lint*, not a
 * `rustc` error, and already suppressed by `compile-rust-project.ts`'s own `FILE_ATTRIBUTES`. This also
 * fully subsumes the previous `needsTrailingPanic` mechanism (Go's own equivalent gap, ported here
 * verbatim before this fix): a non-void function's compiled body now always ends in a literal `return
 * returnValue;`, itself a terminating statement, so Rust's "block must end in a terminating construct"
 * check is satisfied unconditionally — no `panic!("unreachable")` synthesis needed at all anymore.
 */
const RETURN_VALUE_NAME = 'returnValue';

/**
 * Compiles one `function` document's root node into a single Rust function definition — the
 * Rust-target analogue of `compile-go-function.ts`'s `compileGoFunction`. Same simplification over the
 * cpp version as Go has: no cycle-bookkeeping declarations to compute/prepend, since Rust's labeled
 * break/continue needs none (see `rust-statement-context.ts`).
 */
export const compileRustFunction = (functionNode: INode, rustName: string, params: IRustCompileParams): string => {
  const [, body] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }
  const { parameters, returnValue } = getFunctionSignature(functionNode);
  const signatureLine = buildRustSignatureLine(
    rustName,
    parameters,
    returnValue,
    params.structNames,
    params.structDocuments,
  );

  const parameterScope: Record<string, TVariableInfo> = {};
  for (const parameter of parameters) parameterScope[parameter.name] = parameter.type;

  let returnValueDeclaration: readonly string[] = [];
  if (returnValue && returnValue.type !== 'void') {
    parameterScope[RETURN_VALUE_NAME] = returnValue;
    const rustType = variableInfoToRustType(returnValue, params.structNames, params.structDocuments);
    returnValueDeclaration = [`let mut ${RETURN_VALUE_NAME}: ${rustType} = Default::default();`];
  }
  const hasReturnValue = returnValueDeclaration.length > 0;

  const bodyNodes = body.children ?? [];
  const statements = compileRustStatementList(bodyNodes, {
    scope: parameterScope,
    returnValue,
    loopLabels: [],
    usedLabels: new Set(),
    labelCounter: { value: 0 },
    params,
  });

  const trailingReturn = hasReturnValue ? [`return ${RETURN_VALUE_NAME};`] : [];
  const bodyCode = [...returnValueDeclaration, statements, ...trailingReturn].filter((line) => line !== '').join('\n');

  return `${signatureLine} {\n${indentLines(bodyCode)}\n}`;
};
