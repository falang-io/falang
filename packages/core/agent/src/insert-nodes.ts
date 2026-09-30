import type { INode, INodeConfig, NodesStack } from '@falang/dto';
import type { Scheme } from '@falang/scheme';
import { CMD_INSERT_NODE } from '@falang/scheme';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import { getAllowedChildNames } from './node-kinds.js';
import {
  describeFirstChildOutError,
  describeNotAllowedError,
  describeUnknownKind,
  quoteKindName,
} from './node-errors.js';
import type { TToolExecutionResult } from './tool-result.js';
import {
  asRecord,
  asRecordLenient,
  decodeJsonString,
  fail,
  formatZodIssues,
  ok,
  safeParseLenient,
} from './tool-result.js';

/** Stray closing brackets tolerated after a JSON-encoded node — see `parseEncodedNode`. */
const MAX_STRAY_CLOSING_BRACKETS = 3;

/** A JSON-encoded node object, or `null`. Tolerates a few stray `]`/`}` after the object: the real
 *  2026-09-28 string (a whole subtree) was valid JSON except for one extra `]` at the very end. */
const parseEncodedNode = (text: string): Record<string, unknown> | null => {
  let candidate = text.trim();
  for (let attempt = 0; attempt <= MAX_STRAY_CLOSING_BRACKETS; attempt += 1) {
    const rec = asRecord(decodeJsonString(candidate));
    if (rec) return rec;
    if (!/[\]}]$/.test(candidate)) return null;
    candidate = candidate.slice(0, -1).trimEnd();
  }
  return null;
};

/**
 * `asRecordLenient` for an `insert_nodes` node spec, also unwrapping a spec whose `name` is itself a
 * JSON-encoded node — `{ "name": "{\"name\":\"pseudo-cycle\",\"children\":[…]}" }`, seen in a real
 * 2026-09-28 chat: the same model drift `decodeJsonString` handles, one level deeper. The decoded node's
 * own keys win over any sibling keys of the outer object; applied repeatedly for a doubly encoded name.
 */
export const asNodeSpec = (raw: unknown): Record<string, unknown> | null => {
  const rec = asRecordLenient(raw);
  if (!rec || typeof rec.name !== 'string') return rec;
  const inner = parseEncodedNode(rec.name);
  if (!inner || typeof inner.name !== 'string') return rec;
  const { name: _encoded, ...outer } = rec;
  return asNodeSpec({ ...outer, ...inner });
};

type TBuildResult = { ok: true; node: INode } | { ok: false; error: string };

/** What `buildNode`/`buildChildren` need besides the spec: the stack to validate against and the host's
 *  listing filter (error text only, see `describeNotAllowedError`). */
interface IBuildContext {
  readonly stack: NodesStack;
  readonly nodeKindFilter?: IAgentNodeKindFilter;
}

const countNodes = (node: INode): number =>
  1 + (node.children?.reduce((sum, child) => sum + countNodes(child), 0) ?? 0) + (node.out ? countNodes(node.out) : 0);

/** Builds the out-node for a spec's optional `out` field — the same validation `set_out` applies, just
 *  against a not-yet-inserted node's spec instead of a live node id. */
const buildOutNode = (raw: unknown, stack: NodesStack, path: string): TBuildResult => {
  const rec = asNodeSpec(raw);
  if (!rec) return fail(`${path}.out: must be an object`);
  const { data, name } = rec;
  if (typeof name !== 'string') return fail(`${path}.out.name: must be a string`);
  if (!stack.configsMap.has(name)) return fail(`${path}.out: ${describeUnknownKind(name)}`);
  const cfg = stack.getConfig(name);
  if (!cfg.outType) return fail(`${path}.out: node kind "${name}" cannot be used as an out-node (no outType)`);
  let node = stack.factory(name);
  if ('data' in rec) {
    if (!cfg.data) return fail(`${path}.out: node kind "${name}" does not accept data`);
    const parsed = safeParseLenient(cfg.data.type, data);
    if (!parsed.success) return fail(`${path}.out: invalid data — ${formatZodIssues(parsed.error.issues)}`);
    node = { ...node, data: parsed.data };
  }
  return { node, ok: true };
};

type TBuildChildrenResult = { ok: true; children: INode[] | null } | { ok: false; error: string };

/** `null` when `built` is fine to add at position `i`; a `TBuildChildrenResult` failure when it is the
 *  first (index 0) child and carries an `out` — pulled out of `buildChildren`'s two loops (tuple and
 *  named-list) purely to keep that function's own branching complexity down. `built.out` can only be set
 *  here if its own kind's `haveOut` was already confirmed true (see `buildNode`), so no extra config check
 *  is needed — this mirrors `@falang/scheme`'s `canHaveOut` exactly, just against a not-yet-inserted spec. */
const checkFirstChildOut = (i: number, built: INode, parentName: string, path: string): TBuildChildrenResult | null =>
  i === 0 && built.out ? fail(describeFirstChildOutError(parentName, `${path}.children[0].out`)) : null;

/** Builds the `children` a fresh node of kind `cfg` should get from a spec's `children` array (only ever
 *  called once the caller has confirmed the spec actually has a `children` key — see `buildNode` below),
 *  following `cfg`'s own children policy. A `null` result means "leave the factory default untouched" (the
 *  factory's own fixed-tuple branches, e.g. `if`'s two empty `if-child`s, for a `children: 'none'` kind
 *  given an empty array). Mutually recursive with `buildNode` (a `children` entry is itself a full node,
 *  which may have its own `children`) — the two `oxlint-disable-next-line no-use-before-define` below are
 *  that recursion, not an ordering mistake. */
const buildChildren = (
  rawChildren: unknown,
  cfg: INodeConfig,
  ctx: IBuildContext,
  path: string,
): TBuildChildrenResult => {
  const { stack } = ctx;
  const decoded = decodeJsonString(rawChildren);
  if (!Array.isArray(decoded)) return fail(`${path}.children: must be an array`);
  // Each entry may itself arrive JSON-encoded — see `decodeJsonString`.
  const raw: unknown[] = decoded.map((entry) => decodeJsonString(entry));

  if (cfg.childTuple) {
    if (raw.length !== cfg.childTuple.length) {
      return fail(
        `${path}.children: node kind "${cfg.name}" has a fixed ${cfg.childTuple.length}-slot children ` +
          `tuple (${cfg.childTuple.join(', ')}) — got ${raw.length} entries`,
      );
    }
    const children: INode[] = [];
    for (const [i, expectedName] of cfg.childTuple.entries()) {
      const entryRec = asNodeSpec(raw[i]);
      if (!entryRec) return fail(`${path}.children[${i}]: must be an object`);
      if (entryRec.name !== expectedName) {
        const got = typeof entryRec.name === 'string' ? quoteKindName(entryRec.name) : String(entryRec.name);
        return fail(`${path}.children[${i}].name: this slot must be "${expectedName}", got ${got}`);
      }
      // oxlint-disable-next-line no-use-before-define -- mutually recursive with buildNode, see this function's own doc comment
      const built = buildNode(entryRec, ctx, `${path}.children[${i}]`);
      if (!built.ok) return built;
      const outError = checkFirstChildOut(i, built.node, cfg.name, path);
      if (outError) return outError;
      children.push(built.node);
    }
    return { children, ok: true };
  }

  if (cfg.children === true || Array.isArray(cfg.children)) {
    const allowedNames = getAllowedChildNames(cfg.name, stack);
    const children: INode[] = [];
    for (const [i, entry] of raw.entries()) {
      const entryRec = asNodeSpec(entry);
      const entryName = entryRec && typeof entryRec.name === 'string' ? entryRec.name : null;
      if (!entryName) return fail(`${path}.children[${i}].name: must be a string`);
      if (!allowedNames.includes(entryName)) {
        return fail(
          `${path}.children[${i}]: ${describeNotAllowedError(entryName, cfg.name, stack, ctx.nodeKindFilter)}`,
        );
      }
      // oxlint-disable-next-line no-use-before-define -- mutually recursive with buildNode, see this function's own doc comment
      const built = buildNode(entryRec, ctx, `${path}.children[${i}]`);
      if (!built.ok) return built;
      const outError = checkFirstChildOut(i, built.node, cfg.name, path);
      if (outError) return outError;
      children.push(built.node);
    }
    return { children, ok: true };
  }

  if (raw.length > 0) return fail(`${path}.children: node kind "${cfg.name}" does not accept children`);
  return { children: null, ok: true };
};

/** Recursively builds one `INode` (with fresh ids, via `stack.factory`) from an `insert_nodes` spec —
 *  `{ name, data?, children?, out? }` — validating `data` against the kind's schema and `children`/`out`
 *  against its children policy, the same rules `insert_node`/`set_data`/`set_out` each apply
 *  individually. Returns the first error found (by depth-first spec order); nothing is ever partially
 *  applied to the live scheme, since the whole subtree is built before `insert_nodes` dispatches
 *  anything. */
const buildNode = (raw: unknown, ctx: IBuildContext, path: string): TBuildResult => {
  const { stack } = ctx;
  const rec = asNodeSpec(raw);
  if (!rec) return fail(`${path}: must be an object`);
  const { name } = rec;
  if (typeof name !== 'string') return fail(`${path}.name: must be a string`);
  if (!stack.configsMap.has(name)) return fail(`${path}: ${describeUnknownKind(name)}`);
  const cfg = stack.getConfig(name);

  let node = stack.factory(name);
  if ('data' in rec) {
    if (!cfg.data) return fail(`${path}: node kind "${name}" does not accept data`);
    const parsed = safeParseLenient(cfg.data.type, rec.data);
    if (!parsed.success) return fail(`${path}: invalid data — ${formatZodIssues(parsed.error.issues)}`);
    node = { ...node, data: parsed.data };
  }

  if ('children' in rec) {
    const builtChildren = buildChildren(rec.children, cfg, ctx, path);
    if (!builtChildren.ok) return builtChildren;
    if (builtChildren.children !== null) node = { ...node, children: builtChildren.children };
  }

  if ('out' in rec && rec.out !== null) {
    if (!cfg.haveOut) return fail(`${path}: node kind "${name}" cannot have an out-node`);
    const builtOut = buildOutNode(rec.out, stack, path);
    if (!builtOut.ok) return builtOut;
    node = { ...node, out: builtOut.node };
  }

  return { node, ok: true };
};

/** Validates `specs` as the complete children list for the existing node `parentId` and builds them into
 *  fresh `INode`s (new ids) — the same checks `insert_nodes` applies to a subtree's children: each spec's node
 *  kind must be allowed under the parent (`getAllowedChildNames`; a fixed-tuple parent is therefore rejected
 *  here, its slots are not replaceable), `data` is validated against the kind's schema, `children`/`out` are
 *  validated recursively, JSON-encoded specs are decoded leniently, and the first-child-out rule is enforced
 *  (`children[0]` may not carry an `out`). Atomic: nothing is touched on the scheme, and the first error
 *  (depth-first spec order) is returned with its path, e.g. `children[1].children[0]: …`. The caller applies
 *  the result itself (e.g. by deleting the old children and dispatching `CMD_INSERT_NODE` per node). */
export const validateNodeSpecs = (
  scheme: Scheme,
  parentId: string,
  specs: unknown[],
  nodeKindFilter?: IAgentNodeKindFilter,
): { ok: true; nodes: INode[] } | { ok: false; error: string } => {
  const parent = scheme.nodes.getNodeSafe(parentId);
  if (!parent) return fail(`Node not found: ${parentId}`);
  const stack = scheme.infra.structure;
  const allowedNames = getAllowedChildNames(parent.name, stack);
  const ctx: IBuildContext = { nodeKindFilter, stack };
  const nodes: INode[] = [];
  for (const [i, entry] of specs.entries()) {
    const path = `children[${i}]`;
    const rec = asNodeSpec(decodeJsonString(entry));
    if (!rec) return fail(`${path}: must be an object`);
    if (typeof rec.name !== 'string') return fail(`${path}.name: must be a string`);
    if (!allowedNames.includes(rec.name)) {
      return fail(`${path}: ${describeNotAllowedError(rec.name, parent.name, stack, nodeKindFilter)}`);
    }
    const built = buildNode(rec, ctx, path);
    if (!built.ok) return built;
    if (i === 0 && built.node.out) return fail(describeFirstChildOutError(parent.name, `${path}.out`));
    nodes.push(built.node);
  }
  return { nodes, ok: true };
};

export const executeInsertNodes = (
  input: unknown,
  scheme: Scheme,
  nodeKindFilter?: IAgentNodeKindFilter,
): TToolExecutionResult => {
  const params = asRecord(input);
  if (!params) return fail('insert_nodes: invalid input');
  const { index, node: nodeSpec, parentId } = params;
  if (typeof parentId !== 'string') return fail('insert_nodes: parentId is required');
  if (typeof index !== 'number' || !Number.isInteger(index)) return fail('insert_nodes: index must be an integer');
  const parent = scheme.nodes.getNodeSafe(parentId);
  if (!parent) return fail(`Node not found: ${parentId}`);
  const specRec = asNodeSpec(nodeSpec);
  const specName = specRec && typeof specRec.name === 'string' ? specRec.name : null;
  if (!specName) return fail('insert_nodes: node.name is required');

  const stack = scheme.infra.structure;
  const allowedNames = getAllowedChildNames(parent.name, stack);
  if (!allowedNames.includes(specName)) {
    return fail(describeNotAllowedError(specName, parent.name, stack, nodeKindFilter));
  }
  if (index < 0 || index > parent.children.length) {
    return fail(`insert_nodes: index ${index} is out of bounds [0, ${parent.children.length}]`);
  }

  const built = buildNode(specRec, { nodeKindFilter, stack }, 'node');
  if (!built.ok) return fail(built.error);

  if (index === 0 && built.node.out) {
    return fail(describeFirstChildOutError(parent.name, 'node.out'));
  }

  scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index, node: built.node, parentId });
  return ok(JSON.stringify({ insertedCount: countNodes(built.node), insertedId: built.node.id }));
};
