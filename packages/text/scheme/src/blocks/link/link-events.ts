import { createEvent } from '@falang/scheme';

/**
 * Fired when a user clicks a `link` node's navigation glyph — `@falang/text-scheme` has no
 * notion of tabs/navigation itself, so the host app (e.g. `packages/desktop/app-sketch`) is expected to
 * subscribe via `scheme.events.subscribeEvent(EVENT_LINK_CLICKED, ...)` and open the target
 * document.
 */
export const EVENT_LINK_CLICKED = createEvent<{ documentId: string }>('LINK_CLICKED');
