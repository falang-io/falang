import type { INode, INodeMeta } from '@falang/dto';
import type { IOldBlock, IOldIcon, IOldOut } from './old-types.js';

/**
 * Shape shared by `if`/`switch`/`while`/`foreach`/`parallel`/`pseudo-cycle` across all three
 * domains (text/logic/code) — see `packages/core/dto/src/nodes/{if,switch,cycle,parallel,
 * pseudo-cycle}.ts`. Only the *data extraction* differs per domain (a domain-specific leaf field —
 * `text`/`code`/`expression` — vs. logic's structured `foreach` header), and only logic has extra
 * statement kinds (`create_var`, `call_function`, ...) plus a `return`-merging convention on top —
 * both are pluggable below via `convertLeaf`/`foreachData`/`finalizeReturn`, so the
 * branching/wrapper/out structure itself is written once here.
 */
export interface IConvertContext {
  /** `if`/`switch`/`switch`-option/`while`/`throw` condition-or-case-or-message text (old `.text`/`.code`/`.expression`). */
  conditionText(block: IOldBlock | undefined, id: string): string;
  /** `foreach`'s own `data` — a plain string for text/code, `{arr,item,index}` for logic. */
  foreachData(block: IOldBlock | undefined, id: string): unknown;
  /**
   * `out{type:'return'}`'s final statements + expression. Takes the wrapper's already-converted
   * sibling statements so a domain can merge a trailing one into the return expression itself (see
   * `convert-logic-project.ts`'s `returnValue` convention) instead of reading `out.block` directly.
   * Text/code (no such convention) just read `out.block`'s leaf text and pass `children` through.
   */
  finalizeReturn(children: INode[], out: IOldOut): { children: INode[]; data: string };
  /**
   * Fallback for every alias not handled generically here (`action`, `create_var`, `link`,
   * logic's `from_to_cycle`, ...) — takes `ctx` too so a domain-specific statement kind with its own
   * children (e.g. `from_to_cycle`) can recurse back into `convertStatement`/`convertBodyAndExit`.
   */
  convertLeaf(old: IOldIcon, ctx: IConvertContext): INode;
  /** Text domain only: old `leftSide` (the timer) → `INode.mods`; unset elsewhere (leftSide ignored). */
  convertLeftSide?(leftSide: IOldIcon, host: INode): INode[];
}

const metaOf = (entries: Record<string, boolean | number | null>): INodeMeta | null => {
  const meta: Record<string, boolean | number> = {};
  let has = false;
  for (const [key, value] of Object.entries(entries)) {
    if (value !== null) {
      meta[key] = value;
      has = true;
    }
  }
  return has ? meta : null;
};

/**
 * `@falang/dto` forbids `out` (break/continue/return/throw) on `children[0]` of *any*
 * children-bearing container, not just `if`/`switch`/`parallel`'s own branch slots — see
 * `zod-utils.ts`'s comment: this mirrors `SkewerStore.isFirst`, which starts `true` for every skewer
 * and is only ever flipped for a later thread, so it fires on a plain sequential body or a loop just
 * as much as a branch. The one other real (non-`if`/`switch`/`parallel`-wrapper) node kind that can
 * land at `children[0]` carrying its own `out` is a loop (`while`/`foreach`/`from-to-cycle`/
 * `pseudo-cycle`) — its own `out` is that loop's own body's terminal statement (the same "`out` is
 * the last child" convention every compiler's `appendOut` uses). Whether that's safe to rewrite away
 * depends on the jump *and* the loop:
 *
 * - `continue` at the very end of a loop body is always a no-op (it just starts the next iteration,
 *   exactly what falling off the end would do anyway) — dropped unconditionally, for every loop kind.
 * - `pseudo-cycle` always runs its body exactly once, unconditionally (see `@falang/mcp-core`'s
 *   `NODE_KIND_NOTES` entry for this node kind) — so `break` there is *also* a no-op (there is no
 *   later iteration to skip and no condition-recheck to affect), and `return`/`throw` are safe to
 *   hoist into the parent chain right after the `pseudo-cycle`, by the same "this path unconditionally
 *   runs, so nothing already after it in the chain was reachable except through here" argument
 *   `fixIfFirstBranchOut`'s "both branches have `out`" case uses.
 * - `while`/`foreach`/`from-to-cycle` may run their body zero times, in which case their own `out`
 *   never fires at all — so neither dropping nor hoisting a `break`/`return`/`throw` there is
 *   generically safe (it would run unconditionally after a possibly-zero-iteration loop, which the
 *   original never did). Left as a documented, loud failure rather than a silently wrong rewrite — no
 *   real old-format project has hit this so far, see `old-types.ts`'s module doc.
 */
const omitOut = (node: INode): INode => {
  const { out: _out, ...withoutOut } = node;
  return withoutOut;
};

export const fixFirstStatementOut = (statements: readonly INode[], containerLabel: string): INode[] => {
  const first = statements[0];
  if (!first?.out) return [...statements];
  const rest = statements.slice(1);
  if (first.out.name === 'continue') {
    return [omitOut(first), ...rest];
  }
  if (first.name === 'pseudo-cycle') {
    if (first.out.name === 'break') {
      return [omitOut(first), ...rest];
    }
    return [omitOut(first), first.out, ...rest];
  }
  throw new Error(
    `Old node ${first.id}'s early "${first.out.name}" would land as the first statement of "${containerLabel}", ` +
      `which @falang/dto forbids (the scheme always draws a chain's first statement continuing straight down, so ` +
      `it can never itself jump away) — and, unlike "continue" at the end of a loop body, there's no rewrite here ` +
      `that's generically safe (the loop may run zero times, so moving or dropping the jump could change ` +
      `behavior); not supported yet.`,
  );
};

/**
 * Converts a wrapper/loop's own statement list plus its optional old `.out`, applying
 * `finalizeReturn`'s merge for `type:'return'` — shared by `if-child`/`switch-option`/
 * `parallel-thread`/`while`/`foreach`/`pseudo-cycle`, everything in `@falang/dto` with `haveOut`.
 * Mutually recursive with `convertStatement`/`convertWrapper` below (through `Icon → statements →
 * branch wrappers → their own statements → ...`), so this one forward-references `convertStatement`.
 *
 * `containerLabel` names the container being built (`'while'`, `'if-child'`, `'function-body'`, ...)
 * purely for `fixFirstStatementOut`'s error message when it can't be fixed generically.
 */
export const convertBodyAndExit = (
  oldChildren: IOldIcon[] | undefined,
  out: IOldOut | null | undefined,
  ctx: IConvertContext,
  containerLabel: string,
): { children: INode[]; out?: INode } => {
  // oxlint-disable-next-line no-use-before-define -- mutually recursive with convertStatement, see module doc
  const rawStatements = (oldChildren ?? []).flatMap((child) => convertStatement(child, ctx));
  const converted = fixFirstStatementOut(rawStatements, containerLabel);
  if (!out) return { children: converted };

  const meta = metaOf({ outLevel: out.level });
  switch (out.type) {
    case 'break':
    case 'continue': {
      return { children: converted, out: { id: out.id, name: out.type, ...(meta ? { meta } : {}) } };
    }
    case 'throw': {
      return {
        children: converted,
        out: { id: out.id, name: 'throw', ...(meta ? { meta } : {}), data: ctx.conditionText(out.block, out.id) },
      };
    }
    case 'return': {
      const { children, data } = ctx.finalizeReturn(converted, out);
      return { children, out: { id: out.id, name: 'return', ...(meta ? { meta } : {}), data } };
    }
    default: {
      throw new Error(`Unsupported old "out" type "${out.type}" (node ${out.id})`);
    }
  }
};

/** `if-child` / `switch-option` / `parallel-thread` — a branch wrapper: statements plus an optional exit. */
const convertWrapper = (old: IOldIcon, name: string, ctx: IConvertContext, data: unknown = null): INode => {
  const { children, out } = convertBodyAndExit(old.children, old.out, ctx, name);
  return { id: old.id, name, ...(data === null ? {} : { data }), children, ...(out ? { out } : {}) };
};

/**
 * `@falang/dto` forbids `out` (break/continue/return/throw) on `children[0]` of *any*
 * children-bearing container (see `fixFirstStatementOut`'s own doc comment above) — which, for `if`
 * specifically, means its first branch (`if.children[0]`, the branch drawn continuing the scheme's
 * main path straight down) can never itself carry one. The old (pre-monorepo) app had no such rule;
 * its `if` branches were fully symmetric, so a converted `if-child` can legitimately need one there
 * (see this package's ADR 0005 (private) bullet in `CLAUDE.md` for the
 * real fixture — `conditions`'s `TestReturnDefault`, both branches unconditionally return).
 *
 * Unlike a loop's own `out` (see `fixFirstStatementOut`), simply appending it as an ordinary trailing
 * child of that same branch instead of its `out` slot was confirmed to *not* render correctly: the
 * jump/target line a `break`/`continue`/`return`/`throw` needs (routed up through every enclosing
 * skewer to its real target — a loop's exit or the function's own end) is only ever computed from
 * `SkewerStore.out` (`getSkewerOutLines`/`calcualteSkewerExtendedOutlines`, `packages/core/scheme/src/
 * skewer/`); a plain child with the same node name becomes a leaf `OutIconStore` sitting in the
 * skewer's ordinary icon list, which draws only its own short `ownLines` stub and is invisible to
 * that routing — the branch would *look* like it falls through normally instead of jumping.
 *
 * `if`'s two branches are freely swappable instead, with `meta.trueOnRight` inverted to compensate —
 * verified algebraically against `resolveIfBranches`'s exact convention (child 0 = "then", child 1 =
 * "else", flipped by `trueOnRight`, see `packages/simple-code/export/src/generators/shared.ts`) in
 * this file's own test: swapping child order and negating `trueOnRight` together leave `resolveIfBranches`'s
 * `{thenChild, elseChild}` result unchanged. When *both* branches have `out` (no swap helps — whichever
 * lands in slot 0 still has one), slot 1 is left exactly as it is (a valid final slot) and slot 0's
 * `out` is hoisted out of the `if` entirely, becoming a plain trailing statement in the *parent* chain
 * immediately after the `if` — safe specifically because slot 1 unconditionally exits: nothing already
 * following the `if` in that same chain (if anything did) was ever reachable to begin with (both
 * branches always jump away), so hoisting introduces no *new* unreachable-code-drawn-as-reachable
 * artifact beyond what the original two-unconditional-exit `if` already implied.
 */
const fixIfFirstBranchOut = (
  branches: readonly [INode, INode],
  trueOnRight: boolean | undefined,
): { children: [INode, INode]; trueOnRight: boolean | undefined; hoisted?: INode } => {
  const [first, second] = branches;
  if (!first.out) return { children: [first, second], trueOnRight };
  if (!second.out) return { children: [second, first], trueOnRight: !(trueOnRight === true) };
  return { children: [omitOut(first), second], trueOnRight, hoisted: first.out };
};

/**
 * `parallel-thread`s run independently of each other — unlike `if`/`switch`, nothing about a
 * `parallel`'s own semantics depends on which thread is listed first, so a thread whose own `out`
 * would land on `children[0]` can simply be rotated to the end instead (only ever done when there's
 * a second thread to take its place at slot 0). Best-effort: no real `parallel` sample exists — see
 * `old-types.ts`'s module doc — so this has no fixture coverage, only the unit test below.
 */
const rotateFirstParallelThreadIfOut = (threads: readonly INode[]): INode[] => {
  if (threads.length < 2) return [...threads];
  const [first, ...rest] = threads;
  return first.out ? [...rest, first] : [...threads];
};

/** `if`'s two `if-child` branches, with slot 0's `out` fixed up per `fixIfFirstBranchOut`. */
const convertIfStatement = (old: IOldIcon, ctx: IConvertContext): INode[] => {
  const ifChildren = old.children ?? [];
  if (ifChildren.length !== 2) throw new Error(`"if" node ${old.id} must have exactly 2 children`);
  const [falseBranch, trueBranch]: [IOldIcon, IOldIcon] = [ifChildren[0], ifChildren[1]] as [IOldIcon, IOldIcon];
  const convertedBranches: [INode, INode] = [
    convertWrapper(falseBranch, 'if-child', ctx),
    convertWrapper(trueBranch, 'if-child', ctx),
  ];
  const { children, trueOnRight, hoisted } = fixIfFirstBranchOut(convertedBranches, old.trueOnRight);
  const meta = metaOf({ trueOnRight: trueOnRight ?? null });
  const ifNode: INode = {
    id: old.id,
    name: 'if',
    data: ctx.conditionText(old.block, old.id),
    ...(meta ? { meta } : {}),
    children,
  };
  return hoisted ? [ifNode, hoisted] : [ifNode];
};

/** `switch`'s options — see the thrown error's own comment for why slot 0's `out` has no generic fix here. */
const convertSwitchStatement = (old: IOldIcon, ctx: IConvertContext): INode[] => {
  const optionNodes = (old.children ?? []).map((option) =>
    convertWrapper(option, 'switch-option', ctx, ctx.conditionText(option.block, option.id)),
  );
  const firstOut = optionNodes[0]?.out;
  if (firstOut) {
    // Unlike `if`, a `switch`'s options can't be freely reordered (case conditions are matched in
    // listed order, and — unlike `parallel`'s threads — may not be mutually exclusive), so there's
    // no generically safe rewrite here. No real old-format project has hit this so far (see
    // `old-types.ts`'s module doc); fail loudly instead of emitting either an invalid document or
    // one that silently reorders which case matches first.
    throw new Error(
      `Old "switch" node ${old.id}'s first case ends with an early "${firstOut.name}" — converting that ` +
        `safely would require reordering "switch-option" children, which risks changing which case matches ` +
        `first; not supported yet.`,
    );
  }
  return [{ id: old.id, name: 'switch', data: ctx.conditionText(old.block, old.id), children: optionNodes }];
};

const convertStatementWithoutMods = (old: IOldIcon, ctx: IConvertContext): INode[] => {
  switch (old.alias) {
    case 'if': {
      return convertIfStatement(old, ctx);
    }
    case 'switch': {
      return convertSwitchStatement(old, ctx);
    }
    case 'while': {
      const meta = metaOf({ trueIsMain: old.trueIsMain ?? null });
      const { children, out } = convertBodyAndExit(old.children, old.out, ctx, 'while');
      return [
        {
          id: old.id,
          name: 'while',
          data: ctx.conditionText(old.block, old.id),
          ...(meta ? { meta } : {}),
          children,
          ...(out ? { out } : {}),
        },
      ];
    }
    case 'foreach': {
      const { children, out } = convertBodyAndExit(old.children, old.out, ctx, 'foreach');
      return [
        {
          id: old.id,
          name: 'foreach',
          data: ctx.foreachData(old.block, old.id),
          children,
          ...(out ? { out } : {}),
        },
      ];
    }
    case 'pseudo-cycle': {
      // Best-effort: no real `pseudo-cycle` sample exists — see `old-types.ts`'s module doc.
      const { children, out } = convertBodyAndExit(old.children, old.out, ctx, 'pseudo-cycle');
      return [{ id: old.id, name: 'pseudo-cycle', children, ...(out ? { out } : {}) }];
    }
    case 'parallel': {
      // Best-effort: no real `parallel` sample exists — see `old-types.ts`'s module doc.
      const threadNodes = (old.children ?? []).map((thread) => convertWrapper(thread, 'parallel-thread', ctx));
      return [{ id: old.id, name: 'parallel', children: rotateFirstParallelThreadIfOut(threadNodes) }];
    }
    default: {
      return [ctx.convertLeaf(old, ctx)];
    }
  }
};

/** `convertStatementWithoutMods` plus the host's `leftSide` as `mods`. */
export const convertStatement = (old: IOldIcon, ctx: IConvertContext): INode[] => {
  const nodes = convertStatementWithoutMods(old, ctx);
  if (!old.leftSide || !ctx.convertLeftSide) return nodes;
  const [host, ...rest] = nodes;
  if (!host) return nodes;
  return [{ ...host, mods: ctx.convertLeftSide(old.leftSide, host) }, ...rest];
};
