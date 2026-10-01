import { isCodeDocumentType } from '@falang/simple-code-dto';
// Deep import, not the package barrel: the barrel re-exports `driver-registry.ts`'s `node:fs`, which must never reach the
// renderer bundle (see `@falang/desktop-app-arduino`'s `shared/driver-config.ts`).
import { DEVICES_DOCUMENT_TYPE } from '@falang/desktop-arduino-dto/src/devices-document.js';

/** The two desktop IDEs that host the in-app agent (ADR 0026 (private)). */
export type TDesktopAgentProduct = 'sketch' | 'arduino';

/**
 * Which documents the project's one `AgentSession` may edit (ADR 0036 (private)). `app-sketch`: node trees meant to hold
 * executable logic — `function` and every `simple-code-*` language, not `contour`/`text-function`/`mind-tree` (prose
 * trees) or the `*-structure` data-definition editors. `app-arduino`: every scheme document — all of them are `function`
 * trees — except the `Devices` document, which has no `Scheme` at all.
 */
export const isAgentCapableDocumentType = (product: TDesktopAgentProduct, type: string): boolean =>
  product === 'sketch' ? type === 'function' || isCodeDocumentType(type) : type !== DEVICES_DOCUMENT_TYPE;

/** The `fail()` text the LLM sees when it targets a document its host's rule rejects. */
export const explainNotAgentCapable = (
  product: TDesktopAgentProduct,
  doc: { readonly name: string; readonly type: string },
): string =>
  product === 'arduino'
    ? `Document "${doc.name}" is the Devices document and has no scheme editor`
    : `Document "${doc.name}" (${doc.type}) is not a document the agent can edit`;
