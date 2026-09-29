import { randomUUID } from 'node:crypto';
import type { INode } from '@falang/dto';
import { NodesStack } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import { createDocument, listTree } from '@falang/desktop-project-fs';
import {
  DEVICES_DOCUMENT_NAME,
  DEVICES_DOCUMENT_TYPE,
  emptyDevicesDocumentData,
  REQUIRED_ROOT_DOCUMENT_NAMES,
} from '@falang/desktop-arduino-dto';

/**
 * Builds a fresh `function` document root the same way the renderer's
 * `arduinoSchemeFactory(...).infra.structure.factory('function')` used to (a whole `Scheme` was only
 * ever built to reach its `NodesStack`) — the identical stack `@falang/desktop-mcp`'s own
 * `registerArduinoProjectType` (`arduino-project-type.ts`) builds from the same `functionNodesGroup`
 * for the same "default tree for a `'function'` document" purpose. One module-level `NodesStack`
 * instance is enough: `factory()` returns a fresh node tree on every call, nothing here is mutated.
 */
const functionStack = new NodesStack([functionNodesGroup]);
const buildDefaultFunctionRoot = (): INode => functionStack.factory('function');

// Only used to let the queue move on once the previous op settles (success or failure); the real
// outcome is `started` itself, returned below — same shape as
// `@falang/desktop-project-fs`'s own `versioning/serial-queue.ts`.
// oxlint-disable-next-line no-empty-function
const noop = (): void => {};

/**
 * Per-project-directory serial queue, `Map<string, Promise<void>>`-based — the same chaining shape
 * `@falang/desktop-project-fs`'s `GitVersionStore` uses (`versioning/serial-queue.ts`), just keyed by
 * `projectDir` here since this module has no store instance of its own to hold a per-project queue on.
 * Without this, two concurrent calls for the same project directory could both read the manifest
 * before either had written its new document, and both would create one — see this file's own doc
 * comment below for why that's exactly the bug being fixed here.
 */
const queues = new Map<string, Promise<void>>();

const enqueue = (projectDir: string, op: () => Promise<void>): Promise<void> => {
  const tail = queues.get(projectDir) ?? Promise.resolve();
  const started = tail.then(op, op);
  queues.set(projectDir, started.then(noop, noop));
  return started;
};

/** The actual work, run inside `enqueue` above so two calls for the same `projectDir` can never overlap — see `ensureArduinoProjectDocuments`'s own doc comment at the bottom of this file for why that matters. */
const ensureDocumentsOnce = async (projectDir: string): Promise<void> => {
  const tree = await listTree(projectDir);
  const existingNames = new Set(tree.documents.map((doc) => doc.name));

  for (const name of REQUIRED_ROOT_DOCUMENT_NAMES) {
    if (existingNames.has(name)) continue;
    // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: each `createDocument` call is its own manifest read-modify-write, and running these concurrently would re-race the very manifest this function's own per-project-dir serial queue exists to protect against.
    await createDocument(projectDir, {
      document: { id: randomUUID(), type: 'function', name, root: buildDefaultFunctionRoot() },
      folderId: null,
    });
  }

  if (!tree.documents.some((doc) => doc.type === DEVICES_DOCUMENT_TYPE)) {
    await createDocument(projectDir, {
      document: {
        id: randomUUID(),
        type: DEVICES_DOCUMENT_TYPE,
        name: DEVICES_DOCUMENT_NAME,
        data: emptyDevicesDocumentData(),
      },
      folderId: null,
    });
  }
};

/**
 * Creates whichever of the three fixed Arduino documents (`setup`, `loop`, `Devices`) are still
 * missing from `projectDir` — idempotent (an existing document of the right name/type, even a
 * duplicate one, means "skip", never a second create) and safe to call on every project create, open
 * and version restore.
 *
 * ## Why this lives in `main`, not the renderer
 *
 * This used to be `ArduinoProjectStore.loadTree`'s job (`scaffoldRequiredDocument`/
 * `scaffoldDevicesDocument`, renderer-side) — but `ProjectWorkspace` creates that store inside a
 * `useEffect` that React 18 dev StrictMode deliberately double-invokes (mount → cleanup → mount, see
 * that effect's own comment referencing ADR 0021 (private)), so opening one
 * project actually constructed *two* `ArduinoProjectStore`s in quick succession. Both ran `loadTree`
 * concurrently, both read a manifest with no `Devices` document yet, and both created one — a real
 * user-reported bug (opening a pre-existing project created before the `Devices` document existed
 * produced two of them). The old code's "await sequentially" comments only ever serialized *within*
 * one store instance, not across the two StrictMode creates.
 *
 * `@falang/desktop-app-sketch` hit the identical class of bug earlier (its own StrictMode-racy
 * `loadTree()` scaffolding a project's default document twice) and fixed it the same way this file
 * does — never scaffold from a StrictMode-racy renderer effect at all, do it once in `main` instead —
 * see ADR 0005 (private)'s "Implementation notes (project types, new-project
 * dialog, single default document — 2026-09-20)". Here, `main`'s `IPC.projectCreate`/`IPC.projectOpen`
 * handlers (`ipc-handlers.ts`) call this function once each, before `startProjectWatcher` so the
 * creates don't even generate watcher events, and a version restore calls it again through a
 * dedicated `IPC.projectEnsureDocuments` channel (`ArduinoProjectStore.reloadAfterRestore`, since a
 * restored snapshot may itself predate one of these documents) — `main` runs as a single process
 * regardless of how many renderer-side stores StrictMode spins up, and the `queues` map above
 * serializes even that remaining "restore raced a fresh open" edge case.
 */
export const ensureArduinoProjectDocuments = (projectDir: string): Promise<void> =>
  enqueue(projectDir, () => ensureDocumentsOnce(projectDir));
