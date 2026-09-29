# @falang/mcp-core

Transport-free MCP building blocks shared by every host that lets an external coding agent (Claude
Code, or any other MCP client) edit and run falang projects — see
ADR 0029 (private)
for the full design.

This package deliberately has **no transport** (no `@modelcontextprotocol/sdk` dependency — a host
wires these tool definitions into whichever transport it speaks, stdio or Streamable HTTP) and **no
tree editor**: v1's only write path is `set_document` (a whole, validated tree replace), not the
node-level `insert_node`/`set_data`/… tools `@falang/agent`'s in-app loop uses. It also has no
React/MobX/monaco dependency — only `@falang/dto`, the `*-dto` domain packages, and `zod` — so
`packages/workflow/backend` (a plain Node/NestJS process) can depend on it exactly as freely as a
desktop `main` process can.

## What's here

- **`tools.ts`** — `MCP_TOOLS`, the shared v1 tool list (`get_project`, `list_documents`,
  `get_document`, `get_node_kinds`, `create_document`, `set_document`, `rename_document`,
  `move_document`, `delete_document`, `create_folder`, `lock_document`, `unlock_document`), each with
  a zod `inputSchema` and MCP annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`).
  `getMcpToolJsonSchema`/`MCP_TOOL_JSON_SCHEMAS` give the same schemas as plain JSON Schema for a host
  with no zod of its own.
- **`stack-registry.ts`** — `DocumentStackRegistry`, mapping `projectType → documentType →
{ stack: NodesStack; rootNodeName: string }`. `createDefaultDocumentStackRegistry()` pre-registers
  the project types this package can see from dto-level code alone: the desktop app's own seven
  real project types — `'text'` (`contour`/`text-function`/`mind-tree` — `text-function` is the text
  domain's own single-function document, rooted at the text `function` node; not to be confused with
  `'logic'`'s TypeScript `function`), `'logic'` (`function`/`objects-structure`/
  `enum-structure`/`external-api-structure`), and one `'simple-code-<language>'` per language
  (`cpp`/`js`/`ts`/`php`/`rust`, each with exactly one matching document type) — plus `'workflow'`
  (`function`/`trigger-function`/`objects-structure`). A host calls
  `registry.registerProjectType(projectType, documentTypes)` to add its own — e.g. the desktop
  Arduino app's pin/driver node kinds, or the workflow product's per-vendor `integration-action` node
  kinds once it has a runtime integration catalog to build them from (see "What isn't registered
  here" below).
- **`validate-document.ts`** — `validateDocument(projectType, document, registry)` runs the picked
  `NodesStack.parseDocument` and returns `{ ok: true, document }` or `{ ok: false, error }` (every
  zod issue as one `path: message` line).
- **`preserve-meta.ts`** — `preserveMeta(oldRoot, newRoot)`: for every node in `newRoot` whose `id`
  also exists in `oldRoot` and carries no `meta` of its own, copies the old node's `meta` across —
  pure, recurses through `children`/`mods`/`out`, never mutates either input.
- **`locks.ts`** — `IDocumentLock` + pure functions (`isLockActive`, `findActiveLock`, `acquireLock`,
  `renewLock`, `releaseLock`, `pruneExpired`) implementing the ADR's "one source of editing at a time"
  agent-held document lock, `DEFAULT_LOCK_TTL_MS` (5 minutes). No storage, no timers — a host persists
  the `IDocumentLock[]` however it likes (a sidecar file on desktop, two columns on `documents` for
  workflow) and passes `now` in explicitly.
- **`apply-set-document.ts`** — `applySetDocument({ projectType, oldDocument, newRoot, locks, owner,
now, ttlMs?, registry })`: the one acquire-lock → validate → preserve-meta pipeline both hosts'
  `set_document` tool implementation should call, so lock/validation/meta semantics can't drift
  between them.
- **`node-kinds.ts`** — moved here from `@falang/agent` (`getAllowedChildNames`, `describeNodeKind`,
  `buildNodeKindsCatalog`), since both the in-app agent and MCP's `get_node_kinds` describe node kinds
  the same way. `describeNodeKinds(names, stack)` (and `buildNodeKindsCatalog`, built on it) returns an
  `INodeKindsListing` — `{ nodeKinds, $defs? }` — with every named JSON Schema definition the kinds share
  (e.g. `@falang/typescript-dto`'s `VariableType`/`TypeInfo`, named via `.meta({ id })`) hoisted into
  one top-level `$defs`, and each kind's `$schema` line dropped; `describeNodeKind` alone still returns
  a self-contained schema. `@falang/agent` now depends on this package and re-exports the same names from its own
  `node-kinds.ts`, so nothing importing `@falang/agent` needs to change.

## What isn't registered here

`DocumentStackRegistry`'s built-in registrations only use `*-dto` packages — never a `*-scheme`
package (those pull in `monaco-editor`, which crashes outside a browser). Two real
node-kind sources in the codebase are **not** dto-level and so aren't registered by
`createDefaultDocumentStackRegistry()`:

- The workflow product's per-vendor `integration-action`/`integration-trigger`/question/choice node
  kinds (`@falang/workflow-scheme`'s `buildIntegrationNodesIconsGroup`/…) are generated from a
  _runtime_ list of registered vendor integrations (`REGISTERED_INTEGRATIONS` in
  `@falang/workflow-client-common`, which itself pulls in every vendor's scheme package). A host with
  that catalog (the future workflow `/mcp` endpoint) should call `registerProjectType('workflow', …)`
  itself with a stack that also includes `@falang/workflow-integrations-common`'s
  `getIntegrationNodeConfigs`/question/choice equivalents layered onto this package's own `'function'`
  registration.
- The desktop Arduino app's pin/driver node kinds are Electron-free (`packages/desktop/app-arduino/src/
shared/pin-nodes.ts`, and the per-driver `driver-action::…` configs derived from its driver
  registry) but live in an app package, not a `*-dto` package — the desktop MCP stdio server
  (`@falang/desktop-mcp`, ADR phase E) registers the Arduino project type itself via the same
  `registerProjectType` seam.

## `'text'`/`'logic'`/`'simple-code-<language>'` — real, on-disk project types

`packages/desktop/app-sketch` creates a project with `falang.json`'s `type` set to whichever of
these seven strings the user picked in the "New Project…" dialog (see its own `src/shared/
project-types.ts` and ADR 0005 (private)'s "Implementation notes
(project types, new-project dialog, single default document — 2026-09-20)") — this registry's
`'text'`/`'logic'`/`'simple-code-*'` entries match that split exactly, one project type per group of
document types the dialog and the project tree's "+" buttons actually offer. A project created by an
older build of the app still has `type: 'text'` regardless of content; its non-text documents still
open fine in the editor (which reads each document's own type, not the project's), but MCP
`create_document`/`set_document` calls against it are stricter than the editor is — see that ADR
section for the documented workaround (fix `falang.json`'s `type` by hand).

## Testing

`npm test -w @falang/mcp-core`. Every test builds a real `NodesStack` from real `*-dto` packages
(`functionNodesGroup`, `codeFunctionNodesGroup`, …) — no scheme-package test infrastructure is
available here (`@falang/scheme`'s `getTestInfrastructure()` isn't importable without pulling in a
dependency this package deliberately doesn't have).
