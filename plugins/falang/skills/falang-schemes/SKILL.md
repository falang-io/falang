---
description: How falang projects are structured (documents, node trees, data/meta) and how to edit them through the falang MCP tools. Use whenever editing a falang project's documents — workflow, logic, simple-code, or Arduino — via set_document, get_node_kinds, or any other falang-* MCP tool.
---

# Editing falang project documents

A falang project is **documents organized in folders**. Every document holds exactly one tree of
typed nodes (`INode`). This skill is the product-independent mental model shared by every falang
product (workflow, the desktop `logic`/`simple-code` apps, Arduino); see `falang-arduino` and
`falang-workflow` for the product-specific tools and node kinds layered on top.

## The node model

```ts
interface INode {
  id: string; // opaque, unique within the document — never invent a scheme for it
  name: string; // the node kind, e.g. "if", "create-var", "function-body"
  data?: unknown; // per-kind, zod-validated — shape depends on `name`
  meta?: object; // layout only (canvas position etc.) — see "meta" below
  children?: INode[]; // present only if this kind allows children
  mods?: INode[]; // rarely used, node-kind-specific side attachments
  out?: INode; // the node's "exit" branch, only for kinds that declare an outType
}
```

A node **kind** (`name`) declares, once for the whole project type:

- a **children policy**: `true` (any registered kind is a legal child), a fixed list of names
  (only those kinds are legal children), or a fixed positional tuple (e.g. `function` always has
  exactly `[function-header, function-body, function-footer]`, in that order — never add, remove,
  or reorder a tuple's children).
- an optional `data` schema (zod) — most statement kinds have one, some (`function-header`, a
  `break`) don't.
- whether it has an `out` branch (`break`, `continue`, `return`, `throw`, and any `*-child`/
  `*-option`/`*-thread` container all commonly carry one) — you only set `out` on a kind that
  declares it.

**Never guess a kind's children or `data` shape.** Call `get_node_kinds(documentType)` (optionally
`parentName` to filter to what's legal under one specific kind) before composing a tree — it
returns `{ nodeKinds, $defs? }`: for every kind, its children policy and the exact `data` JSON Schema,
plus the named definitions several schemas share (e.g. `VariableType`, the shape of every variable/
parameter type) listed once in `$defs` and referenced from the kinds as `#/$defs/<id>`. Kind names and data
shapes differ per document type (`function` vs `simple-code-cpp` vs a workflow `trigger-function`) and per
project, so treat the catalog as ground truth over anything memorized, including the examples
below.

## `meta` — leave it alone

`meta` holds layout only (canvas position, collapsed state), never anything semantic. When you
write a node that already existed, **omit `meta` or copy it back unchanged** — the server
preserves a surviving node's old `meta` by `id` automatically, but only if you don't overwrite it
with something else. When you create a brand-new node, omit `meta` entirely and let the editor lay
it out.

## Ids

Ids are opaque strings, unique within a document. **Keep the existing id when you edit a node that
already exists** — that's what lets the server carry its `meta`/layout forward and lets a human
editor's undo history make sense of the change. For a brand-new node, generate any unique string
you haven't used elsewhere in that document (a short random string is fine — it never needs to
match the app's own id format).

## Expressions are real TypeScript

In `logic`/`simple-code`-TypeScript and workflow projects, any field described as an "expression" string
(e.g. `if`'s `data`, `create-var`'s `value`) is literal TypeScript source, type-checked against the
identifiers actually in scope at that point in the tree: variables from `create-var`, a `foreach`
loop's `item`/`index`, a `from-to-cycle`'s loop variable, function parameters, and the result
variables of `arr-pop`/`arr-shift` (typed as the array's element type) or `arr-slice` (typed as the
array itself). Reference identifiers that are genuinely in scope; don't invent globals.

## The working loop

1. `get_project` — confirms the project type and which document types it allows.
2. `list_documents` — ids, names, types, folders, and lock state.
3. `get_node_kinds(documentType)` — the exact catalog of node kinds and `data` schemas for that
   document type (call again with `parentName` once you know which subtree you're building, to
   narrow to legal children there).
4. `get_document(documentId)` — the current full tree, if you're editing rather than
   creating from scratch.
5. Compose the **full** new tree in memory (there is no node-level insert/edit tool in v1 — every
   write replaces the whole document).
6. `set_document(documentId, root)` — validates the whole tree against the document type's node
   kinds, preserves `meta` for surviving ids, writes it, and **auto-acquires a lock** on the
   document for you.
7. On a validation error, the tool result names the failing zod path (e.g.
   `root.children.2.data.arr`) — fix just that part and retry; nothing was written.
8. When you're done editing a document, call `unlock_document(documentId)` so a human (or another
   agent) can edit it again. The lock also expires on its own after 5 minutes if you forget.

`create_document(name, type, folderId?, root?)` makes a new document; omit `root` to get that
document type's default empty tree. `rename_document`/`move_document`/`delete_document` and
`create_folder` round out project structure. `delete_document` is destructive — confirm with the
user before calling it on anything they didn't explicitly ask to remove.

## Locks — one editor at a time

`set_document` fails with `locked by another session until <expiresAt>` if another agent session
holds the lock on that document (the human editor never holds locks; while _you_ hold one, the
editor shows the document as locked and stops saving). Don't fight the lock by retrying in a loop —
tell the user the document is locked and wait, or work on something else first.

## Prefer domain nodes over one big `action`

Every function-shaped document type has generic escape hatches (`action` for a free statement,
`log`) but also real control-flow and data nodes: `create-var`, `if`, `foreach`/`from-to-cycle`,
`switch`, `call-function`, the `arr-*` kinds. Prefer the specific kind — it's what a human user of
the editor would place, it renders as a real icon on the canvas instead of an opaque code blob, and
(in workflow/logic projects) it type-checks against scope. Reach for a plain `action` only when no
more specific kind fits.

**`call-function` targets another document by id** (`data.schemeId`), not by name — get the real id
from `list_documents` first. A `schemeId` that doesn't match any real document id fails at build
time, not at `set_document` time (the id itself is just a string as far as the node's own schema is
concerned).

## A complete real example

A `function` document (as used by the `logic` project type and, undecorated, by workflow's plain
`function` documents) named `TestNestedIf`, with a `from-to-cycle` loop over `x` from 0 to 9 that
logs on even values and calls another document (id `doc-helper`) otherwise:

```json
{
  "id": "doc-main",
  "type": "function",
  "name": "TestNestedIf",
  "root": {
    "id": "doc-main-root",
    "name": "function",
    "children": [
      { "id": "doc-main-header", "name": "function-header", "data": "" },
      {
        "id": "doc-main-body",
        "name": "function-body",
        "data": { "parameters": [], "returnValue": null },
        "children": [
          {
            "id": "x-loop",
            "name": "from-to-cycle",
            "data": { "from": "0", "to": "9", "item": "x" },
            "children": [
              {
                "id": "if-even",
                "name": "if",
                "data": "x % 2 === 0",
                "children": [
                  {
                    "id": "if-even-then",
                    "name": "if-child",
                    "children": [{ "id": "log1", "name": "log", "data": "even" }]
                  },
                  {
                    "id": "if-even-else",
                    "name": "if-child",
                    "children": [
                      {
                        "id": "call1",
                        "name": "call-function",
                        "data": { "schemeId": "doc-helper", "parameters": ["x"], "returnVariable": "" }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      { "id": "doc-main-footer", "name": "function-footer", "data": "" }
    ]
  }
}
```

Notes on the shapes above (always confirm with `get_node_kinds` for a given project — this is one
concrete instance, not a schema):

- `function`'s children are a **fixed tuple** — always exactly header/body/footer, in that order.
- `if`'s two children are always exactly two `if-child` nodes (then, else) — an `if-child` with no
  `children` is an empty branch, not an error.
- `from-to-cycle` is inclusive of `to` (`x` takes every value `0..9`, ten iterations).
- `function-body.data.returnValue` is `null`/absent for a void function.
