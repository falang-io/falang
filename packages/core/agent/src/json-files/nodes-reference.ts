import type { INodeConfig, NodesStack } from '@falang/dto';
import { zod } from '@falang/dto';
import { describeNodeKind, describeNodeKinds, getAllowedChildNames } from '@falang/mcp-core';
import { visibleMetaKeys } from './project-node-tree.js';
import { templateFieldsOf, templateFieldsOfKind } from './template-fields.js';

/** One document type a reference covers: where its files live and which kind is its root. */
export interface INodesReferenceDocumentType {
  readonly type: string;
  readonly rootKind: string;
  /** e.g. `functions/<name>.json` — shown verbatim. */
  readonly filePattern: string;
  /** Host-specific lines about this document type (where the signature lives, what the payload is, …). */
  readonly notes?: readonly string[];
}

export interface IBuildNodesReferenceParams {
  readonly stack: NodesStack;
  readonly documentTypes: readonly INodesReferenceDocumentType[];
  /** Kinds hidden from the listing (still valid when written) — e.g. vendors without an instance. */
  readonly isListed?: (kind: string) => boolean;
  /** Appended when at least one kind was hidden — how to unlock it. */
  readonly hiddenNote?: string;
  /** Host-specific rules appended to the generic ones. */
  readonly extraRules?: readonly string[];
}

/**
 * Notes that replace `get_node_kinds`' ones in a document file reference: those talk about `meta` and `set_meta`, which
 * the file interface hides (an `if` is shown then-branch first, `while` shows its one flag).
 */
const FILE_NOTE_OVERRIDES: Readonly<Record<string, string>> = {
  if:
    '"children" is [then-branch, else-branch]: slot 0 runs when the condition is true, slot 1 otherwise (leave a ' +
    'branch\'s "children" empty for no else). Which side the editor draws each on is handled for you.',
  while:
    'Repeats while the condition is true. Only if the condition is meant inverted (loop UNTIL it becomes true) set ' +
    '"meta": { "trueIsMain": true } on the node — that compiles to `while (!(condition))`.',
};

const reachableKinds = (stack: NodesStack, roots: readonly string[]): string[] => {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name) || !stack.configsMap.has(name)) continue;
    seen.add(name);
    const cfg = stack.getConfig(name);
    queue.push(...(cfg.childTuple ?? []), ...getAllowedChildNames(name, stack), ...(cfg.mods ?? []));
    if (cfg.haveOut) for (const out of stack.configsMap.values()) if (out.outType) queue.push(out.name);
  }
  return [...seen];
};

/** A one-line shape of a kind's `data`: `string`, or `{ a*, b }` with `*` for required, plus the schema file. */
const describeData = (cfg: INodeConfig, stack: NodesStack): string => {
  if (!cfg.data) return 'no data';
  const schema = describeNodeKind(cfg.name, stack).dataSchema ?? {};
  const templates = new Set(templateFieldsOf(cfg.name, stack));
  if (schema.type === 'string') return templateFieldsOfKind(cfg.name, stack).whole ? 'data: string (template)' : 'data: string';
  if (schema.type === 'boolean' || schema.type === 'number') return `data: ${String(schema.type)}`;
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (schema.type === 'object' && properties) {
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : null);
    const fields = Object.keys(properties).map(
      (key) => `${key}${required.has(key) ? '*' : ''}${templates.has(key) ? ' (template)' : ''}`,
    );
    return `data: { ${fields.join(', ')} } → schemas/${cfg.name}.json`;
  }
  return `data: see schemas/${cfg.name}.json`;
};

const describeChildren = (cfg: INodeConfig, stack: NodesStack): string => {
  if (cfg.childTuple) return `children: exactly [${cfg.childTuple.join(', ')}]`;
  if (cfg.children === true) return 'children: statements';
  if (Array.isArray(cfg.children)) return `children: list of ${getAllowedChildNames(cfg.name, stack).join(' | ')}`;
  return '';
};

const kindLine = (cfg: INodeConfig, stack: NodesStack, notes: string | undefined): string => {
  const parts = [describeData(cfg, stack), describeChildren(cfg, stack)];
  if (cfg.haveOut) parts.push('may have "out"');
  if (cfg.mods && cfg.mods.length > 0) parts.push(`mods: ${cfg.mods.join(', ')}`);
  const meta = visibleMetaKeys(cfg.name);
  if (meta.length > 0) parts.push(`meta: { ${meta.join(', ')} } (only these flags)`);
  const head = `- \`${cfg.name}\` — ${parts.filter(Boolean).join('; ')}`;
  return notes ? `${head}\n  ${notes}` : head;
};

const GENERIC_RULES = [
  'A document file is ONE JSON object: the document\'s root node. Every node is `{ "id", "name", "data"?, "children"?, "out"?, "mods"? }`; `name` is the node kind.',
  'Ids: keep the ids of nodes you read — that is how a node keeps its identity, layout and undo history. A NEW node needs no "id" (one is assigned; read the file again to see it). Never reuse one id twice; to copy a node, drop its "id".',
  'Kinds with "children: exactly [...]" have fixed slots: always write all of them, in that order. Statements never go directly into such a node — they go into a slot\'s own "children" (e.g. `function` → `function-body`).',
  '"out" is a jump that ends a node\'s branch: `break`/`continue` (loops), `return`/`throw`. It is a separate node in "out", never a child. The FIRST child of any list can\'t have an "out" — put it on a later sibling. (An `if` whose then-branch jumps away is fixed automatically.)',
  '`if`: "children" is [then-branch, else-branch] — slot 0 runs when the condition is true. Each branch is an `if-child` whose "children" are statements.',
  'Fields marked (template) are the BODY of a JavaScript template literal: plain text with `${expr}` for values — no surrounding backticks or quotes. Other string fields that hold conditions, expressions or code are real TypeScript.',
  'Write a whole file with write_file, or change part of it with edit_file (exact text, copied from a fresh read_file — the files are re-formatted after every write).',
];

/**
 * `NODES.md` (ADR 0062 §2.1): every node kind reachable from the given document roots, with its data shape, children
 * policy, out/mods/meta, and the notes `get_node_kinds` would attach — plus the structural rules the stack enforces.
 * Small enough to read once per run; a kind's full data schema is `schemas/<kind>.json` (`buildKindSchemaFile`).
 */
export const buildNodesReference = (params: IBuildNodesReferenceParams): string => {
  const { stack } = params;
  const isListed = params.isListed ?? (() => true);
  const all = reachableKinds(
    stack,
    params.documentTypes.map((doc) => doc.rootKind),
  );
  const listed = all.filter((name) => isListed(name));
  const notesOf = (name: string): string | undefined =>
    FILE_NOTE_OVERRIDES[name] ?? describeNodeKind(name, stack).notes;
  const statementSet = new Set(
    all.flatMap((name) => (stack.getConfig(name).children === true ? getAllowedChildNames(name, stack) : [])),
  );
  const sections: [string, (cfg: INodeConfig) => boolean][] = [
    ['Document roots', (cfg) => Boolean(cfg.documentRootOnly)],
    ['Statements (anywhere a list says "children: statements")', (cfg) => statementSet.has(cfg.name) && !cfg.outType],
    ['Outs (only in a node\'s "out")', (cfg) => Boolean(cfg.outType)],
    ['Mods (only in a host\'s "mods")', (cfg) => stack.modKindNames.has(cfg.name)],
  ];
  const placed = new Set<string>();
  const lines: string[] = [
    '# Node kinds',
    '',
    '## Rules',
    '',
    ...[...GENERIC_RULES, ...(params.extraRules ?? [])].map((rule) => `- ${rule}`),
    '',
    '## Files',
    '',
  ];
  for (const doc of params.documentTypes) {
    lines.push(`- \`${doc.filePattern}\` — a "${doc.type}" document, root kind \`${doc.rootKind}\`.`);
    for (const note of doc.notes ?? []) lines.push(`  ${note}`);
  }
  lines.push('');
  for (const [title, test] of sections) {
    const configs = listed.map((name) => stack.getConfig(name)).filter((cfg) => !placed.has(cfg.name) && test(cfg));
    if (configs.length === 0) continue;
    lines.push(`## ${title}`, '');
    for (const cfg of configs) {
      placed.add(cfg.name);
      lines.push(kindLine(cfg, stack, notesOf(cfg.name)));
    }
    lines.push('');
  }
  const rest = listed.map((name) => stack.getConfig(name)).filter((cfg) => !placed.has(cfg.name));
  if (rest.length > 0) {
    lines.push('## Structural kinds (only where a parent names them)', '');
    for (const cfg of rest) lines.push(kindLine(cfg, stack, notesOf(cfg.name)));
    lines.push('');
  }
  if (listed.length < all.length && params.hiddenNote) lines.push(`Note: ${params.hiddenNote}`, '');
  lines.push("Every kind's full data schema: `schemas/<kind>.json`.", '');
  return lines.join('\n');
};

/** `schemas/<kind>.json`: the kind's `data` JSON Schema with its `$defs` inlined into one document. */
export const buildKindSchemaFile = (kind: string, stack: NodesStack): string | null => {
  const cfg = stack.configsMap.get(kind);
  if (!cfg) return null;
  if (!cfg.data) return `${JSON.stringify({ description: `"${kind}" carries no data.` }, null, 2)}\n`;
  const listing = describeNodeKinds([kind], stack);
  const schema = listing.nodeKinds[0]?.dataSchema ?? (zod.toJSONSchema(cfg.data.type) as Record<string, unknown>);
  const ownDefs = (schema.$defs as Record<string, unknown> | undefined) ?? {};
  const defs = { ...listing.$defs, ...ownDefs };
  const document = Object.keys(defs).length > 0 ? { ...schema, $defs: defs } : schema;
  return `${JSON.stringify(document, null, 2)}\n`;
};
