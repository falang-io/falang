import type { INodeConfig, NodesStack } from '@falang/dto';
import { zod } from '@falang/dto';
import { SQL_VENDOR_NODE_KIND_NOTES, VENDOR_NODE_KIND_NOTES } from './node-kind-notes-vendors.js';

/**
 * `{ tuple: [...] }` names every fixed slot in order (e.g. `if` → `['if-child', 'if-child']`) — unlike
 * `string[]` (an unordered, unbounded set of allowed kinds), a tuple parent's children policy is
 * "exactly these kinds, in this exact order, this exact count", and `getAllowedChildNames` deliberately
 * returns `[]` for it (see that function's own comment) since "any of these names, any number of times"
 * doesn't apply. `insert_node`/`insert_nodes` can never target a tuple parent's own id directly for this
 * reason — a real 2026-09-22 agent chat spent several failed `insert_node` attempts discovering this the
 * hard way before falling back to a `get_tree` round trip to find the slot ids, which spelling the slot
 * names out here avoids entirely.
 */
export type TNodeKindChildren = 'any' | string[] | { readonly tuple: readonly string[] } | 'none';

export interface INodeKindDescription {
  readonly name: string;
  readonly children: TNodeKindChildren;
  readonly dataSchema?: Record<string, unknown>;
  readonly haveOut?: boolean;
  readonly outType?: string;
  readonly notes?: string;
}

/**
 * Non-obvious compiled/runtime semantics of specific node kinds, worth surfacing to an LLM editing
 * the tree — the sort of thing a human would only learn by reading the compiler source. Keyed by
 * node name; a name with no entry gets no `notes`. Only core (this package's own) node kinds live
 * here — every vendor-specific entry (`telegram-question`/`telegram-question-option`/`call-ai-choice`/
 * `call-ai-choice-option`/`call-ai-text`/`files-*`/`http-request`/…, describing node kinds that only
 * exist once a vendor with `questions`/`choices`/actions is layered onto a `NodesStack` at runtime —
 * see `@falang/workflow-integrations-common`'s `IQuestionDescriptor`/`IChoiceDescriptor`/
 * `IActionDescriptor` and `packages/workflow/backend`'s `buildWorkflowMcpRegistry`) lives in
 * `node-kind-notes-vendors.ts` instead, split out purely to stay under this repo's 300-line-per-file
 * lint cap — see `ALL_NODE_KIND_NOTES` below for where the two are merged. Entries are still keyed by
 * plain node name rather than threaded through `IQuestionDescriptor`/`INodeConfig` from each vendor's
 * own file, because `describeNodeKind` already works generically off whatever `INodeConfig` a
 * caller's `NodesStack` happens to contain (its `dataSchema` is derived the same generic way) — this
 * map is simply the one place every MCP host (`backend`, `@falang/desktop-mcp`, the in-app
 * `@falang/agent`) shares to attach a footnote to a node name, regardless of which package actually
 * defined that node kind. Found worth adding after a real user chat: the in-app agent built a
 * Telegram Q&A bot's yes/no logic as a `switch` matching the *next incoming message's* lowercased
 * text instead of a `telegram-question` with real buttons — the bare JSON Schema for
 * `telegram-question` gives no hint that its `options` become tappable Telegram inline-keyboard
 * buttons rather than text to match against.
 */
const NODE_KIND_NOTES: Record<string, string> = {
  magic: [
    'A transparent group: `data.spell` is a human, plain-language description of the step (shown as the',
    'only thing on the canvas), its children are the real nodes and compile inlined, as if they stood in the',
    'parent directly — variables they create are visible after the group. When editing a document, edit',
    'inside the group or unwrap it (move its children out) rather than deleting it wholesale. When you',
    'create a group yourself, set `spell` to describe it. A magic node cannot contain another magic node.',
  ].join(' '),
  if: [
    'Its two children are positional, not named by branch: `children[0]` is always drawn continuing',
    'straight down (the main path) and `children[1]` to the side. Which one actually runs when the',
    'condition is true is controlled by `meta.trueOnRight` — absent or `false` (the default) means',
    '`children[0]` runs when the condition is true and `children[1]` when it is false; `true` swaps them.',
    'To change it, call set_meta with the *existing* meta spread in (e.g. other keys like `width` live',
    'there too) plus the new `trueOnRight` value — never a bare `{ trueOnRight: true }` that drops the rest.',
  ].join(' '),
  while: [
    'Which way the condition is read is controlled by `meta.trueIsMain` — absent or `false` (the default)',
    'compiles to a normal `while (condition)`: the loop keeps repeating for as long as the condition is',
    'true, and stops the moment it is false. `true` inverts it: the loop keeps repeating while the',
    'condition is false and stops once it becomes true (compiles to `while (!(condition))`). Change it via',
    "set_meta with the existing meta spread in, the same way as `if`'s `meta.trueOnRight` — never overwrite",
    'the whole meta object.',
  ].join(' '),
  'pseudo-cycle': [
    'Compiles to `while (true) { <body>; break; }` — the trailing `break` is added automatically, even if',
    'the body never calls `break`/`continue` itself, so the body always runs exactly once. It is not a',
    'repeating loop: the `while (true)` wrapper exists only so `break`/`continue` are valid syntax inside',
    'the body (e.g. to end this one run early). The body reaching its end with no explicit `break`/`continue`',
    'is the normal, working case, not a bug to fix.',
  ].join(' '),
  break: [
    'Leaves only the innermost enclosing loop; execution then continues with the statements that come',
    "right after that loop in the loop's own parent — they still run. If nothing after the loop should run",
    'on this path (e.g. the job is already done and a trailing "gave up"/"timeout" message follows the',
    'loop), use `return` instead.',
  ].join(' '),
  return: [
    'Ends the whole function immediately — nothing after it runs, including any statements placed after',
    'the loop(s) it sits in. Use it (rather than `break`) for a path that has fully finished its work.',
  ].join(' '),
  'objects-structure': [
    'An `objects-structure` document only DECLARES data types — TypeScript interfaces, one per',
    '`objects-structure-thread` — for the editor to type-check and autocomplete against. It is NOT storage:',
    'it holds no values, nothing is saved into it at runtime, and it is erased at build time (a struct',
    'compiles to a plain object). Values live in variables (`create-var` inside a function) typed with one',
    'of these interfaces. Its children are a fixed `objects-structure-header` (free-text note) and',
    '`objects-structure-body` (holds the interfaces).',
  ].join(' '),
  'objects-structure-header': 'A free-text note/title shown at the top of the document; has no effect on the types.',
  'objects-structure-body': [
    'Holds the interfaces of this document, one `objects-structure-thread` per interface. Add a whole',
    'interface with `insert_nodes` (a thread plus its property children in one call).',
  ].join(' '),
  'objects-structure-thread': [
    'One interface (a named struct type). `data` is the interface name — a PascalCase English identifier',
    '(e.g. `GameState`, `Question`); name it after what the object IS, not after a role like "Storage".',
    'Its children are the properties, one `objects-structure-child` each. To use this interface as a',
    "type elsewhere (e.g. a `create-var` variableType, an array elementType, another property's type),",
    'reference it as `{ "type": "struct", "id": "<this thread\'s node id>" }` — the id is the thread',
    "node's own id from get_tree, not its name. A thread with no properties declares no type at all.",
    'Inserted with plain insert_node (no children given), it gets two placeholder properties — prefer',
    'insert_nodes with the real properties as `children`.',
  ].join(' '),
  'objects-structure-child': [
    'One property of the enclosing interface: `data` is `{ name, variableType }` (a camelCase property',
    'name and its type — the same type shape `create-var` uses, including `{ "type": "struct", "id": … }`',
    'for a nested interface and `optional: true` for an optional property). Never give it children: nested',
    'nodes under a property are ignored; declare a separate interface and reference it by struct id instead.',
  ].join(' '),
};

/** `describeNodeKind`'s actual lookup table — merges this file's own core `NODE_KIND_NOTES` with `node-kind-notes-vendors.ts`'s vendor/SQL-dialect entries (see that constant's own doc comment above). */
const ALL_NODE_KIND_NOTES: Record<string, string> = {
  ...NODE_KIND_NOTES,
  ...VENDOR_NODE_KIND_NOTES,
  ...SQL_VENDOR_NODE_KIND_NOTES,
};

/** Node kinds some config names explicitly — `slots`: a fixed `childTuple` position (e.g.
 *  `function-body`, `if-child`); `listed`: a dedicated child kind in a named `children` list (e.g.
 *  `switch-option`, `call-ai-choice-option`). Both are structural parts of another kind, never
 *  free-standing statements. Cached per stack (a `NodesStack` is immutable once built). */
interface IStructuralNames {
  readonly slots: ReadonlySet<string>;
  readonly listed: ReadonlySet<string>;
}

const structuralNamesCache = new WeakMap<NodesStack, IStructuralNames>();

const getStructuralNames = (stack: NodesStack): IStructuralNames => {
  const cached = structuralNamesCache.get(stack);
  if (cached) return cached;
  const slots = new Set<string>();
  const listed = new Set<string>();
  for (const cfg of stack.configsMap.values()) {
    for (const name of cfg.childTuple ?? []) slots.add(name);
    if (Array.isArray(cfg.children)) for (const name of cfg.children) listed.add(name);
  }
  const names = { listed, slots };
  structuralNamesCache.set(stack, names);
  return names;
};

export const getAllowedChildNames = (parentName: string, stack: NodesStack): string[] => {
  const cfg = stack.getConfig(parentName);
  if (cfg.children === true) {
    // Mirrors `@falang/dto`'s `createZodUnion`: "any node from the stack" means any *statement* node —
    // a `documentRootOnly` kind (e.g. `function`, `trigger-function`) is excluded even when it shares
    // this stack with the parent, since it may only ever be a document's own `root`. Structural kinds
    // (see `getStructuralNames`) are excluded too (2026-09-27, ADR 0034 (private)'s "token budget"
    // note): `function-body`/`if-child`/`switch-option`/… used to be offered, and accepted, as plain
    // statements inside any `children: true` body — ~13 KB of every workflow `get_node_kinds` result, and
    // meaningless to insert there. A tuple slot never nests anywhere. A listed kind may nest under itself
    // only where nothing else could (a mind-tree's `…-child`, whose stack has no statement kinds at all):
    // a `telegram-question-option`/`call-ai-choice-option` body is a list of statements, and offering the
    // option kind itself there (2026-09-28, a real agent chat's error message listed it) invites an option
    // nested inside an option.
    const { listed, slots } = getStructuralNames(stack);
    const statements = [...stack.configsMap.values()]
      .filter(
        (c) =>
          !c.documentRootOnly && !cfg.excludeChildren?.includes(c.name) && !slots.has(c.name) && !listed.has(c.name),
      )
      .map((c) => c.name);
    return statements.length === 0 && listed.has(parentName) ? [parentName] : statements;
  }
  if (Array.isArray(cfg.children)) return [...cfg.children];
  return [];
};

const classifyChildren = (cfg: INodeConfig): TNodeKindChildren => {
  if (cfg.children === true) return 'any';
  if (Array.isArray(cfg.children)) return cfg.children;
  if (cfg.childTuple) return { tuple: [...cfg.childTuple] };
  return 'none';
};

export const describeNodeKind = (name: string, stack: NodesStack): INodeKindDescription => {
  const cfg = stack.getConfig(name);
  const notes = ALL_NODE_KIND_NOTES[cfg.name];
  const base = {
    children: classifyChildren(cfg),
    haveOut: cfg.haveOut,
    name: cfg.name,
    notes,
    outType: cfg.outType,
  };
  return cfg.data ? { ...base, dataSchema: zod.toJSONSchema(cfg.data.type) as Record<string, unknown> } : base;
};

/** Several node kinds' descriptions, with the named JSON Schema definitions they share hoisted out. */
export interface INodeKindsListing {
  readonly nodeKinds: INodeKindDescription[];
  /** Named definitions (e.g. `@falang/typescript-dto`'s `VariableType`/`TypeInfo`) that `nodeKinds`'
   *  `dataSchema`s reference as `#/$defs/<id>` — listed once here instead of once per kind that uses them.
   *  Absent when no kind in the listing references a named definition. */
  readonly $defs?: Record<string, unknown>;
}

/** zod's name for a definition it had to extract without an explicit `.meta({ id })` (a recursive or,
 *  with `reused: 'ref'`, reused schema) — numbered per `toJSONSchema` call, so the same name means
 *  unrelated things in two kinds' schemas and is never hoisted. */
const ANONYMOUS_DEF_NAME = /^__schema\d+$/;
const ANONYMOUS_DEF_REF = '"#/$defs/__schema';

/** Named `$defs` entries safe to share between `dataSchemas`: identical in every schema that has them,
 *  and not pointing at a schema-local anonymous definition. */
const collectSharedDefs = (dataSchemas: readonly Record<string, unknown>[]): Map<string, unknown> => {
  const shared = new Map<string, { def: unknown; json: string }>();
  const rejected = new Set<string>();
  for (const dataSchema of dataSchemas) {
    const defs = dataSchema.$defs as Record<string, unknown> | undefined;
    for (const [key, def] of Object.entries(defs ?? {})) {
      if (ANONYMOUS_DEF_NAME.test(key) || rejected.has(key)) continue;
      const json = JSON.stringify(def);
      const existing = shared.get(key);
      if (json.includes(ANONYMOUS_DEF_REF) || (existing && existing.json !== json)) {
        rejected.add(key);
        shared.delete(key);
      } else if (!existing) shared.set(key, { def, json });
    }
  }
  return new Map([...shared].map(([key, { def }]) => [key, def]));
};

/** A definition's own `id` (zod copies `.meta({ id })` into the emitted schema) just repeats its key. */
const withoutOwnId = (key: string, def: unknown): unknown => {
  if (typeof def !== 'object' || def === null || (def as { id?: unknown }).id !== key) return def;
  const { id: _id, ...rest } = def as Record<string, unknown>;
  return rest;
};

/** `dataSchema` minus the hoisted `$defs` entries and minus `$schema` (the same draft URL on every kind). */
const withoutSharedDefs = (
  dataSchema: Record<string, unknown>,
  shared: ReadonlyMap<string, unknown>,
): Record<string, unknown> => {
  const { $defs, $schema: _schema, ...rest } = dataSchema;
  const ownDefs = Object.entries(($defs as Record<string, unknown> | undefined) ?? {}).filter(
    ([key]) => !shared.has(key),
  );
  return ownDefs.length > 0 ? { ...rest, $defs: Object.fromEntries(ownDefs) } : rest;
};

/**
 * Describes `names` (see `describeNodeKind`) as one listing, hoisting every named JSON Schema definition
 * the kinds' `dataSchema`s share into one top-level `$defs` (2026-09-27, ADR 0034 (private)'s "shared
 * type schema" note): the variable-type schema alone is ~3 KB and used to be repeated inside every kind
 * that takes a type (`create-var`, `function-body`, `trigger-function-body`, `call-ai-choice-option`, …).
 * The kinds keep their `#/$defs/<id>` references unchanged, which resolve against the listing's root.
 */
export const describeNodeKinds = (names: readonly string[], stack: NodesStack): INodeKindsListing => {
  const described = names.map((name) => describeNodeKind(name, stack));
  const shared = collectSharedDefs(described.flatMap((kind) => (kind.dataSchema ? [kind.dataSchema] : [])));
  // `described` is freshly built above and owned here, so its entries are updated in place.
  const nodeKinds = described.map((kind) =>
    kind.dataSchema ? Object.assign(kind, { dataSchema: withoutSharedDefs(kind.dataSchema, shared) }) : kind,
  );
  if (shared.size === 0) return { nodeKinds };
  return { $defs: Object.fromEntries([...shared].map(([key, def]) => [key, withoutOwnId(key, def)])), nodeKinds };
};

export const buildNodeKindsCatalog = (stack: NodesStack): INodeKindsListing =>
  describeNodeKinds([...stack.configsMap.keys()], stack);
