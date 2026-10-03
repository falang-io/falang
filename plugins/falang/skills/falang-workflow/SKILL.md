---
description: Building, running, publishing, and debugging falang workflow projects through the falang-workflow MCP server (dev vs prod, polling a run's position, triggers, credentials, integrations). Use whenever building/running/publishing a workflow project, or editing a trigger-function document, on a hosted falang workflow instance.
---

# Operating falang workflow projects

Read `falang-schemes` first for the document/node model — this skill covers the workflow
product's own tools on top of it: build/run/publish and its node kinds (`trigger-function`,
per-vendor integration actions).

## Dev vs prod — know which one you're touching

- **Dev** is always the live, currently-edited code — every `build`/`start_dev_run` compiles and
  runs whatever the documents currently say, killing and replacing the previous dev run. Safe to
  use freely; it never affects real traffic.
  In practice: `build` → poll `get_build_status` until done (`get_code` shows the compiled output,
  with compile-error markers pointing back at the node id that failed) → `start_dev_run` → poll
  `get_run_position` → `get_run_history` once finished.
- **Prod** is one or more **published versions** sharing one task queue; each execution stays
  pinned to the exact version it started on (`PINNED` versioning) — publishing a new version never
  moves an in-flight execution onto it. `publish` compiles the current documents into a new,
  immutable version and starts routing _new_ executions to it; `activate_version` re-routes new
  executions to a specific existing version (rollback); `stop_version` retires an old version's
  runner once nothing is still pinned to it.

**`publish`, `activate_version`, and `stop_version` affect real, possibly-in-flight production
traffic — always confirm with the user before calling any of them**, the same way you would before
running a destructive command. `delete_document`/`delete_project`-style tools carry the same
`destructiveHint` and need the same confirmation.

## Polling, not push

There is no push notification for a run's progress — `get_run_position` and `get_run_history` are
polled. Poll every couple of seconds, not tighter, and stop polling once the run's status is
terminal (finished/failed/stopped) rather than polling indefinitely.

## `trigger-function` vs plain `function` documents

A plain `function` document's root is `function` / `function-header` / `function-body` /
`function-footer` (see `falang-schemes`). A `trigger-function` document has the same header/footer
but its body is a `trigger-function-body` node, whose `data` fixes which external event starts it:

```ts
{
  vendor: string;       // e.g. which integration vendor
  triggerName: string;  // which of that vendor's triggers
  credentialId: string; // which configured credential/instance of that vendor
  scopeVariableName: string; // the identifier the trigger payload is exposed as, in scope for the body
  scopeType: TVariableInfo;  // that payload's type
  triggerConfig?: Record<string, string>; // extra per-trigger config, if the trigger has any
}
```

`vendor`/`triggerName`/`scopeVariableName`/`scopeType` are fixed when the trigger function is
created and not meant to be freely rewritten by hand — don't invent values for them. The body's
**children are ordinary statements**, edited the same as any `function-body`'s.

## Credentials and integrations

`list_credentials` returns names/vendors/ids only — **never secrets**; reference a credential by
its id in a node's `data` (e.g. `trigger-function-body.credentialId`, or an integration action
node's `credentialId` field), never ask for or fabricate its value. `list_integrations` is a keyword
search over the vendor/action/trigger catalog currently available to the project: pass `keywords`
(English — e.g. `["telegram"]`, `["ai", "llm"]`, `["crm"]`) for the best-matching vendors (up to 10,
each with its plain-English `notes`, actions and their fields, triggers, question/choice node kinds),
or omit them for a compact `vendor` + `notes` index of every vendor. Each vendor action is registered
as its own node kind (its name comes straight from that catalog), with a `data` shape that is a
flat object of expression-string fields specific to that action; call `get_node_kinds` for the
document type to get the exact field list/schema once you know which action's node kind you need.
Don't guess an integration action's node name or fields from memory — look it up.

## Project layout: fixed sections

The project root holds the pinned `Integrations` document and three fixed section folders — **Triggers**
(`trigger-function`), **Functions** (`function`), **Types** (`objects-structure`); `list_documents` marks them
with `fixedKind` (`triggers`/`functions`/`types`) and pinned documents with `pinned`. Each document type lives
only in its own section or a subfolder of it. Omit `folderId` on `create_document` (or pass `null` to
`move_document`) to land in the type's section; a `folderId` outside it is refused with an error naming the right
section and its folder id. `create_folder` needs a `parentId` inside a section (never the root), a folder can be
moved only within its own section, and the section folders and pinned documents can't be renamed, moved or
deleted. Nested folders inside a section are free.

## `call-function` across documents

Same rule as `falang-schemes`: `call-function.data.schemeId` is a **document id**, from
`list_documents`, never a name. If you used `import_project` to author a whole project from a
fixture in one call, note that import does **not** remap `call-function`/`call-api` references
embedded inside a document's own tree (only top-level document ids are remapped) — after import,
resolve the real id of the target document via `list_documents` and `set_document` the calling
document with the corrected `schemeId`.

## Debugging

`debug_start`/`debug_state`/`debug_set_breakpoints`/`debug_resume`/`debug_stop` drive the same
breakpoint/pause/resume model as the editor's own visual debugger — set breakpoints by node id
(the same ids used everywhere else in the tree), start a debug run, poll `debug_state` for the
current paused location and in-scope variables, `debug_resume` to continue, `debug_stop` to end the
session.

## Full workflow-only tool list

`list_projects`, `create_project`, `import_project`, `export_project`, `list_functions`, `build`,
`get_build_status`, `get_code`, `start_dev_run`, `get_run_position`, `stop`, `list_runs`,
`get_run_history`, `publish`, `list_versions`, `activate_version`, `stop_version`, `debug_start`,
`debug_state`, `debug_set_breakpoints`, `debug_resume`, `debug_stop`, `list_credentials`,
`list_integrations` — plus the shared project/document tools from `falang-schemes`
(`get_project`, `list_documents`, `get_document`, `get_node_kinds`, `create_document`,
`set_document`, `rename_document`, `move_document`, `delete_document`, `create_folder`,
`lock_document`, `unlock_document`).
