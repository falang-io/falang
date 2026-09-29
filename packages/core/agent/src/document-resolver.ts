import type { Scheme } from '@falang/scheme';

/**
 * Turns a tool call's `documentId` into the `Scheme` to run it against — the seam that lets
 * `AgentSession` edit documents other than the one the user has open (ADR 0034/0036). `core/agent` stays
 * ignorant of what a "document" is beyond this opaque id; the host (e.g. the workflow client's
 * `WorkflowStore.getScheme`) owns building/caching the actual `Scheme` instances.
 */
export interface IAgentDocumentResolver {
  /** `documentId` is always a concrete id here — `AgentSession` resolves a call whose `documentId` is
   *  omitted to the run's effective active document id itself (ADR 0036), passing that id through to this
   *  method rather than special-casing the omitted case. A throw (unknown/non-editable id) is caught by
   *  `AgentSession` and turned into a `fail()` tool result the LLM sees, not a fatal run error. */
  resolve(documentId: string): Scheme;
}

/**
 * Default resolver for hosts without cross-document support — always returns the session's
 * `defaultScheme` regardless of which id it's asked to resolve (i.e. today's single-document behavior),
 * and throws when there is none (no document to fall back to at all). Takes a getter rather than a fixed
 * `Scheme` so it always answers with whatever the session was constructed with, not a value captured once
 * ahead of time.
 */
export const createHomeOnlyDocumentResolver = (getDefaultScheme: () => Scheme | null): IAgentDocumentResolver => ({
  resolve: () => {
    const scheme = getDefaultScheme();
    if (!scheme) {
      throw new Error(
        'AgentSession: no document to resolve — this session has no defaultScheme and no documentResolver was provided',
      );
    }
    return scheme;
  },
});
