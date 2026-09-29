import type { INode } from '@falang/dto';
import { getContainerScopeContribution, getScopeContribution, type IScopeVariable } from '@falang/typescript-common';
import { emitDebugTrace, type IDebugEmitOptions } from './debug-trace-emit.js';
import { indentLines } from './indent.js';
import { LEAF_EMITTERS, emitCallFunction } from './leaf-emitters.js';
import { NodeCompileError } from './node-compile-error.js';
import { POSITION_AT_FN } from './position-runtime.js';
import { asExpression } from './raw-code.js';
import { throwUnresolvedCallFunction, type TResolveFunctionName } from './resolve-function-name.js';
import { appendOut, buildSwitchCases, type TCompileChildren } from './switch-cases.js';

export type { TResolveFunctionName } from './resolve-function-name.js';
export type { IDebugEmitOptions, IDebugTraceSite } from './debug-trace-emit.js';

const resolveOutLevel = (node: INode): number => {
  const outLevel = node.meta?.outLevel;
  return typeof outLevel === 'number' ? outLevel : 1;
};

/** `break`/`continue` resolve `outLevel` against the loop-label stack, marking it used so its loop renders `label: for (...)` — the only way `break` targets an outer loop correctly through an intervening `switch`. */
const emitLoopJump = (
  keyword: 'break' | 'continue',
  node: INode,
  loopLabels: readonly string[],
  usedLabels: Set<string>,
): string => {
  const label = loopLabels[loopLabels.length - resolveOutLevel(node)];
  if (!label) throw new Error(`"${node.name}" node ("${node.id}") targets a loop level that doesn't exist`);
  usedLabels.add(label);
  return `${keyword} ${label};`;
};

interface IForeachHeaderData {
  readonly arr: string;
  readonly item: string;
  readonly index: string;
}

/** `index` is always present in the data but may be an empty string when the user doesn't need it. */
const buildForeachHeader = (data: IForeachHeaderData): string => {
  const arr = asExpression(data.arr);
  const item = data.item.trim();
  const index = data.index.trim();
  return index === '' ? `for (const ${item} of ${arr})` : `for (const [${index}, ${item}] of ${arr}.entries())`;
};

const emitForeach = (node: INode, compile: TCompileChildren): string => {
  const header = buildForeachHeader(node.data as IForeachHeaderData);
  const body = compile(appendOut(node));
  return `${header} {\n${indentLines(body)}\n}`;
};

interface IFromToCycleHeaderData {
  readonly from: string;
  readonly to: string;
  readonly item: string;
}

/** Inclusive ascending range: `from` and `to` are both visited. */
const buildFromToCycleHeader = (data: IFromToCycleHeaderData): string => {
  const from = asExpression(data.from);
  const to = asExpression(data.to);
  const item = data.item.trim();
  return `for (let ${item} = ${from}; ${item} <= ${to}; ${item}++)`;
};

const emitFromToCycle = (node: INode, compile: TCompileChildren): string => {
  const header = buildFromToCycleHeader(node.data as IFromToCycleHeaderData);
  const body = compile(appendOut(node));
  return `${header} {\n${indentLines(body)}\n}`;
};

/**
 * `while`'s "True" branch label is flipped by `meta.trueIsMain` — by default (absent/`false`) "True"
 * marks the back-edge (repeat the loop), so the raw condition compiles as-is. When `trueIsMain` is
 * `true`, "True" instead marks the main path down (exit the loop), so the condition must be negated
 * for the loop to keep repeating on "False" — same "diagram must match compiled code" convention as
 * `resolveIfBranches`'s `meta.trueOnRight`, just for a loop's single condition rather than two branches.
 */
const resolveWhileCondition = (node: INode): string => {
  const condition = asExpression(node.data as string);
  const trueIsMain = node.meta?.trueIsMain === true;
  return trueIsMain ? `!(${condition})` : condition;
};

const emitWhile = (node: INode, compile: TCompileChildren): string => {
  const condition = resolveWhileCondition(node);
  const body = compile(appendOut(node));
  return `while (${condition}) {\n${indentLines(body)}\n}`;
};

/** "Run once unless explicitly repeated" — compiles to `while (true)` with an unconditional trailing `break;`, so a body that never hits its own `continue`/`break` still terminates after one iteration. */
const emitPseudoCycle = (node: INode, compile: TCompileChildren): string => {
  const body = compile(appendOut(node));
  const content = body === '' ? 'break;' : `${body}\nbreak;`;
  return `while (true) {\n${indentLines(content)}\n}`;
};

interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** `if` always has 2 `if-child` positions; first = "then"/second = "else" by default, flipped by `meta.trueOnRight`. */
const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

const emitIf = (node: INode, compile: TCompileChildren): string => {
  const condition = asExpression(node.data as string);
  const { thenChild, elseChild } = resolveIfBranches(node);
  const thenBody = compile(thenChild ? appendOut(thenChild) : []);
  const elseBody = compile(elseChild ? appendOut(elseChild) : []);
  const elseBlock = elseBody === '' ? '' : ` else {\n${indentLines(elseBody)}\n}`;
  return `if (${condition}) {\n${indentLines(thenBody)}\n}${elseBlock}`;
};

const emitSwitch = (node: INode, compile: TCompileChildren): string => {
  const discriminant = asExpression(node.data as string);
  const cases = buildSwitchCases(node.children ?? [], compile, (option) => asExpression(option.data as string));
  return `switch (${discriminant}) {\n${indentLines(cases)}\n}`;
};

const emitParallel = (node: INode, compile: TCompileChildren): string => {
  const threads = (node.children ?? [])
    .map((thread) => {
      const body = compile(appendOut(thread));
      return body === '' ? '(async () => {})()' : `(async () => {\n${indentLines(body)}\n})()`;
    })
    .join(',\n');
  return `await Promise.all([\n${indentLines(threads)}\n]);`;
};

/** Loop node kinds `break`/`continue` can target; each gets its own entry on the `loopLabels` stack. */
const LOOP_EMITTERS: Record<string, (node: INode, compile: TCompileChildren) => string> = {
  foreach: emitForeach,
  'from-to-cycle': emitFromToCycle,
  while: emitWhile,
  'pseudo-cycle': emitPseudoCycle,
};

/** Node kinds whose compiled output embeds the (recursively) compiled statements of their children. */
const RECURSIVE_EMITTERS: Record<string, (node: INode, compile: TCompileChildren) => string> = {
  if: emitIf,
  switch: emitSwitch,
  parallel: emitParallel,
};
/** Leaf emitters for integration action nodes, built dynamically per project — see `integration-emitters.ts`. */
export type TIntegrationEmitters = Record<string, (node: INode) => string>;
/** Recursive emitters for vendor "question with buttons" nodes, built dynamically per project — see `question-emitters.ts`. */
export type TQuestionEmitters = Record<string, (node: INode, compile: TCompileChildren) => string>;
const compileStatementsInternal = (
  nodes: readonly INode[],
  resolveFunctionName: TResolveFunctionName,
  integrationEmitters: TIntegrationEmitters,
  questionEmitters: TQuestionEmitters,
  loopLabels: readonly string[],
  usedLabels: Set<string>,
  trackPosition: boolean,
  scope: readonly IScopeVariable[],
  debug: IDebugEmitOptions | undefined,
): string => {
  const recurse = (
    children: readonly INode[],
    labels: readonly string[],
    nextScope: readonly IScopeVariable[],
  ): string =>
    compileStatementsInternal(
      children,
      resolveFunctionName,
      integrationEmitters,
      questionEmitters,
      labels,
      usedLabels,
      trackPosition,
      nextScope,
      debug,
    );
  // A container's own contribution (a loop's `item`/`index`, a choice option's bound variable, …) is
  // only visible to that container's *children* — computed here, once per container node, only when
  // debug instrumentation actually needs it (see `getContainerScopeContribution`, `@falang/typescript-common`).
  const childScopeFor = (node: INode, outerScope: readonly IScopeVariable[]): readonly IScopeVariable[] =>
    debug ? [...outerScope, ...getContainerScopeContribution(node)] : outerScope;

  // Declared once, outside the loop below, and called per node — the closure itself only reads
  // values that don't change across iterations (`resolveFunctionName`, `usedLabels`, `recurse`, …);
  // everything that does (`node`, `labels`, `outerScope`) is passed in as an argument.
  const compileNodeCode = (node: INode, labels: readonly string[], outerScope: readonly IScopeVariable[]): string => {
    if (node.name === 'call-function') return emitCallFunction(node, resolveFunctionName);
    if (node.name === 'break') return emitLoopJump('break', node, labels, usedLabels);
    if (node.name === 'continue') return emitLoopJump('continue', node, labels, usedLabels);
    const leafEmitter = LEAF_EMITTERS[node.name];
    if (leafEmitter) return leafEmitter(node);
    const integrationEmitter = integrationEmitters[node.name];
    if (integrationEmitter) return integrationEmitter(node);
    const loopEmitter = LOOP_EMITTERS[node.name];
    if (loopEmitter) {
      const label = `L${labels.length + 1}`;
      const nextLoopLabels = [...labels, label];
      const nextScope = childScopeFor(node, outerScope);
      const compiled = loopEmitter(node, (children) => recurse(children, nextLoopLabels, nextScope));
      return usedLabels.has(label) ? `${label}: ${compiled}` : compiled;
    }
    // `questionEmitters` (see question-emitters.ts) shares this branch with `RECURSIVE_EMITTERS` — same signature, globally-unique node names.
    const recursiveEmitter = RECURSIVE_EMITTERS[node.name] ?? questionEmitters[node.name];
    if (recursiveEmitter) {
      const nextScope = childScopeFor(node, outerScope);
      return recursiveEmitter(node, (children) => recurse(children, labels, nextScope));
    }
    throw new Error(`No compiler emitter registered for node "${node.name}"`);
  };

  // Scope grows across siblings as we go (a `create-var` becomes visible to every statement after
  // it, not to itself or to any statement before it) — an imperative loop, not `.map()`, so each
  // node's own trace point sees exactly the scope built up from its earlier siblings. `runningScope`
  // is mutated in place (`push`, not a spread-and-reassign) since every reader (`emitDebugTrace`,
  // `childScopeFor`) consumes it synchronously in the same iteration it's read, before it can grow
  // further — a later `push` never retroactively changes what an earlier reader already saw.
  const runningScope: IScopeVariable[] = [...scope];
  const lines: string[] = [];
  for (const node of nodes) {
    try {
      const code = compileNodeCode(node, loopLabels, runningScope);
      // Every statement is wrapped so a diagnostic's line number can always be resolved back to
      // the node that produced it — see `parse-compiled-markers.ts`.
      if (code !== '') {
        // With position tracking on, the node's id is recorded right before its own statement runs;
        // with debug instrumentation on, a trace point is recorded the same way — both inside the
        // markers, so `parse-compiled-markers.ts` still attributes the line to this node. See
        // `position-runtime.ts`/`debug-runtime.ts`.
        const prefixLines = [
          trackPosition ? `${POSITION_AT_FN}(${JSON.stringify(node.id)});` : '',
          debug ? emitDebugTrace(node, runningScope, debug) : '',
        ].filter((line) => line !== '');
        const traced = prefixLines.length > 0 ? `${prefixLines.join('\n')}\n${code}` : code;
        lines.push(`// icon-start:${node.name}:${node.id}\n${traced}\n// icon-end:${node.name}:${node.id}`);
      }
    } catch (error) {
      // A deeper recursive call (an `if`/`switch`/loop body, etc.) may have already attributed
      // this to one of its own children — don't clobber that with this outer node's id.
      if (error instanceof NodeCompileError) throw error;
      throw new NodeCompileError(node.id, error instanceof Error ? error.message : String(error));
    }
    if (debug) {
      const contribution = getScopeContribution(node);
      if (contribution) runningScope.push(contribution);
    }
  }
  return lines.join('\n');
};

/**
 * Compiles statement nodes into TS; `integrationEmitters`/`questionEmitters` handle registered
 * vendors' action/question node kinds. Every statement is wrapped in `// icon-start:<name>:<id>` /
 * `// icon-end:...` marker comments (see `parse-compiled-markers.ts`), so any diagnostic against the
 * compiled output can always be resolved back to the node that produced it. `trackPosition` adds a
 * `__falangAt('<id>')` call before each statement — see `position-runtime.ts`; `debug` adds an
 * `await __falangDebug.trace(<idx>, () => ({...scope}))` call and records the scope walked at every
 * statement — see `debug-runtime.ts`. Both off by default so the many exact-string tests of
 * individual emitters stay focused on the emitters themselves.
 */
export const compileStatements = (
  nodes: readonly INode[],
  resolveFunctionName: TResolveFunctionName = throwUnresolvedCallFunction,
  integrationEmitters: TIntegrationEmitters = {},
  questionEmitters: TQuestionEmitters = {},
  trackPosition = false,
  debug?: IDebugEmitOptions,
  /** The scope this statement list's *container* contributes to it — e.g. `function-body`'s parameters. See `getContainerScopeContribution`. */
  initialScope: readonly IScopeVariable[] = [],
): string =>
  compileStatementsInternal(
    nodes,
    resolveFunctionName,
    integrationEmitters,
    questionEmitters,
    [],
    new Set(),
    trackPosition,
    initialScope,
    debug,
  );
