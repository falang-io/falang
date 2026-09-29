import type { IAgentDocumentResolver } from '@falang/agent';
import type { Scheme } from '@falang/scheme';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';

/** The minimum a document needs to expose for the resolver's own eligibility checks — a subset of
 *  `WorkflowDocument`, kept narrow so this file doesn't depend on `../workflow-types.js`. */
export interface IAgentResolvableDocument {
  readonly type: string;
  readonly pinned?: boolean;
}

export interface ICreateAgentDocumentResolverDeps {
  /** Looks up a document's metadata (type/pinned) by id — `undefined` when no such document exists. */
  readonly getDocument: (documentId: string) => IAgentResolvableDocument | undefined;
  readonly getScheme: (documentId: string) => Scheme;
  /** Called once per document per run, on first touch — see `AgentLockTracker.acquire`. */
  readonly acquireLock: (documentId: string) => void;
}

/** `objects-structure` (interface declarations) joined `function`/`trigger-function` on 2026-09-27 — see
 *  ADR 0034 (private)'s note of that date: a real chat created one to declare its game's data types and
 *  then could neither read nor edit it. */
export const isAgentEditableType = (type: string): boolean =>
  type === 'function' || type === TRIGGER_FUNCTION_NAME || type === OBJECTS_STRUCTURE_NAME;

/**
 * Builds the `IAgentDocumentResolver` the project's `AgentSession` uses to turn a tool call's
 * `documentId` into the `Scheme` to run it against (ADR 0034 §1) — a plain function over injected
 * callbacks so it's testable without a real `WorkflowStore`/DOM/backend. `documentId` is always a
 * concrete id here (ADR 0036 (private) §1): `AgentSession` itself resolves an omitted `documentId`
 * to the run's active document without ever calling this resolver, so there's no "home scheme" case to
 * handle here any more.
 *
 * Rejects (throws, *before* acquiring any lock) a document that doesn't exist, is pinned, or isn't a
 * `function`/`trigger-function`/`objects-structure` document — the only document types the workflow
 * product's editing agent can act on (ADR 0036 (private) §"Home document per host"). A throw here is caught by
 * `AgentSession` and surfaced to the LLM as a `fail()` tool result, not a fatal run error.
 */
export const createAgentDocumentResolver = (deps: ICreateAgentDocumentResolverDeps): IAgentDocumentResolver => ({
  resolve: (documentId) => {
    const doc = deps.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.pinned) throw new Error(`Document ${documentId} is pinned and cannot be edited by the agent`);
    if (!isAgentEditableType(doc.type)) {
      throw new Error(
        `Document ${documentId} is a "${doc.type}" document — the agent can only edit function/trigger-function/objects-structure documents`,
      );
    }
    deps.acquireLock(documentId);
    return deps.getScheme(documentId);
  },
});
