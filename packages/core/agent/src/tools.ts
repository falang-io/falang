import type { ILlmToolDefinition } from './llm-client.js';

const DOCUMENT_ID_DESCRIPTION =
  "id of the document to act on (from the project's document list). Omit to act on the document open in " +
  'the editor.';

/**
 * Appended to `insert_nodes`/`set_out` — a real 2026-09-27 chat (a Telegram "guess the celebrity" bot)
 * ended a won game with `break` inside a `while`, right before a "sorry, I couldn't guess" message placed
 * after that loop, so the "gave up" message was sent after every win too. Pick an out by what must run
 * next, not by "this branch is done".
 */
const OUT_KIND_SEMANTICS =
  'Choosing the out kind — decide by what must run NEXT: `continue` jumps to the next iteration of the ' +
  'innermost enclosing loop; `break` leaves only that loop and execution carries on with the statements ' +
  'placed right after the loop in its parent — they still run; `return` ends the whole function right ' +
  'there, so nothing after it runs (including anything after the loop); `throw` ends it with an error. ' +
  'Before using `break`, look at what follows the loop: if that code is only meant for the other way out ' +
  '(e.g. a "sorry, I gave up"/"out of attempts" message after a game loop), a branch that has already ' +
  'finished the job (e.g. the guess was confirmed and a final message was sent) must use `return`.';

export const AGENT_TOOLS: readonly ILlmToolDefinition[] = [
  {
    name: 'get_tree',
    description: 'Read-only. Returns the serialized subtree rooted at nodeId (defaults to the document root).',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
    },
  },
  {
    name: 'get_node_kinds',
    description:
      'Read-only. Returns `{ nodeKinds, $defs?, note? }`: the node kinds allowed as children of parentId, ' +
      'each with its exact data JSON Schema; definitions several schemas share (e.g. `VariableType`) are ' +
      'referenced as `#/$defs/<id>` and listed once in `$defs`.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['parentId'],
    },
  },
  {
    name: 'insert_node',
    description:
      'Inserts a new node of kind `name` as a child of parentId at position index. Call get_node_kinds for ' +
      'parentId first if you are not sure which `name` values are allowed there or what shape `data` must have. ' +
      '`data` must match that node kind\'s dataSchema exactly as given — a schema of `{"type":"string"}` wants ' +
      "a real JS string, never a boolean/number literal and never that object JSON.stringify'd into a string. " +
      'A schema of `{"type":"object",...}` wants a real nested object, not a stringified one. When a string ' +
      'property in the dataSchema has a `description`, it says how that string is interpreted — follow it: e.g. ' +
      'an expression field wants bare code (`message.chat.id`, not `${message.chat.id}`), and a template-text ' +
      'field wants the text itself with NO surrounding backticks/quotes (they are added automatically). ' +
      'To add several nodes under one parent, or a node together ' +
      'with its own children/branches, prefer `insert_nodes` — one call instead of many, and either the whole ' +
      'subtree is created or none of it is. Note: a node inserted at index 0 (the first child of its parent) ' +
      'can never itself get an out via a later set_out — see set_out.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        index: { type: 'integer' },
        name: { type: 'string' },
        data: {},
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['parentId', 'index', 'name'],
    },
  },
  {
    name: 'insert_nodes',
    description:
      'Inserts a whole subtree — one node plus, recursively, its own children/branches and out-node — as a ' +
      'child of parentId at position index, in a single call. The whole subtree is validated before anything ' +
      'is applied: if any node anywhere in it is invalid (wrong kind, bad data, wrong place), nothing is ' +
      'inserted and the error says exactly which node in the tree (e.g. `node.children[1].children[0]`) was ' +
      'the problem. Prefer this over several separate `insert_node` calls whenever you already know the full ' +
      'shape of what you are adding — e.g. an `if` together with both branches, a `switch` with all its ' +
      '`switch-option`s, or a loop body with several statements in it.\n\n' +
      'Each node in the tree is `{ name, data?, children?, out? }`:\n' +
      "- `data` — same rules as `insert_node`'s `data` (see get_node_kinds for the exact schema per kind).\n" +
      "- `children` — omit it to get that kind's default (nothing, for most kinds). For a kind whose " +
      'get_node_kinds `children` is a name list or "any", `children` is that list of child node specs. For a ' +
      'kind whose get_node_kinds `children` is `{"tuple": [...]}` (e.g. `if` → `["if-child", "if-child"]`) — ' +
      "never call insert_node/insert_nodes directly on that tuple parent's own id, it has no allowed children " +
      "by name — `children` must have exactly as many entries as the tuple, each one's `name` matching the " +
      "corresponding slot name in order, and each slot's own `children` holds what runs inside that branch " +
      "(e.g. `if`'s first `if-child` is the then-branch, the second is the else-branch).\n" +
      '- `out` — only for a kind whose get_node_kinds entry has `haveOut: true` (e.g. an `if-child` or ' +
      '`switch-option` branch that should jump — to the next iteration, out of the loop, or out of the whole function): `{ name, data? }` for an out-type kind ' +
      '(`break`/`continue`/`return`/`throw`), or omit it entirely for no out-node. Never `null` — omit the key. ' +
      'The first child (index 0) of ANY parent is drawn continuing straight down as the main path, so it can ' +
      'never itself carry an out, even if its own kind has haveOut: true — move the branch that needs the ' +
      'jump to a later position instead (for `if`, swap the two branches and flip `meta.trueOnRight`, which ' +
      'keeps the exact same semantics). Do not work around it by appending the out-type node as a plain last ' +
      `child: that compiles the same, but the editor only draws the jump line for a real \`out\`. ${OUT_KIND_SEMANTICS}`,
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        index: { type: 'integer' },
        node: { $ref: '#/$defs/nodeSpec' },
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['parentId', 'index', 'node'],
      $defs: {
        nodeSpec: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            data: {},
            children: { type: 'array', items: { $ref: '#/$defs/nodeSpec' } },
            out: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                data: {},
              },
              required: ['name'],
            },
          },
          required: ['name'],
        },
      },
    },
  },
  {
    name: 'delete_node',
    description: 'Deletes the node with the given id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_data',
    description: "Replaces the node's `data` field. Must match the node kind's data schema.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        data: {},
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['id', 'data'],
    },
  },
  {
    name: 'set_meta',
    description: "Replaces the node's `meta` field.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        meta: { type: 'object' },
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['id', 'meta'],
    },
  },
  {
    name: 'move_nodes',
    description:
      'Moves a contiguous run of `length` children starting at indexStart under oldParentId to insertIndex under ' +
      "newParentId (within one document). insertIndex is a position in newParentId's current children, counted " +
      'before the move. Same rules as insert_node: the moved kinds must be allowed under newParentId, a ' +
      'fixed-tuple slot (e.g. an if-child) cannot leave its parent, a node cannot move into its own subtree, and ' +
      'neither parent may end up with an out on its first child. Nothing is applied if any rule fails.',
    inputSchema: {
      type: 'object',
      properties: {
        oldParentId: { type: 'string' },
        indexStart: { type: 'integer' },
        length: { type: 'integer' },
        newParentId: { type: 'string' },
        insertIndex: { type: 'integer' },
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['oldParentId', 'indexStart', 'length', 'newParentId', 'insertIndex'],
    },
  },
  {
    name: 'set_out',
    description:
      'Sets or clears the out-node of the node with the given id. name: null clears it; otherwise a node of ' +
      'kind `name` is created (the node kind must declare an outType) with optional `data`. Rejected if id is ' +
      "the first child (index 0) of its parent — that child is drawn continuing straight down as the parent's " +
      'main path and can never itself have an out. Move the branch that needs the jump to a later position ' +
      `instead (for \`if\`, swap the two branches and flip \`meta.trueOnRight\`). ${OUT_KIND_SEMANTICS}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: ['string', 'null'] },
        data: {},
        documentId: { type: 'string', description: DOCUMENT_ID_DESCRIPTION },
      },
      required: ['id', 'name'],
    },
  },
  {
    name: 'finish',
    description:
      'Ends the current run. `message` is your direct, first-person reply to the user — this is what they ' +
      'will read in the chat. Write a normal conversational answer (e.g. answer their question, or say what ' +
      'you changed), not a report about what you did.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
  },
];

/** Core tools that never change a document — `AgentSession` opens an undo group only before a tool NOT in
 *  this set, so a read-only run never holds the user's history hostage (ADR 0046 (private): a magic run
 *  reads in the background while the person keeps editing and pressing Ctrl+Z). */
export const READ_ONLY_CORE_TOOLS: ReadonlySet<string> = new Set(['get_tree', 'get_node_kinds']);
