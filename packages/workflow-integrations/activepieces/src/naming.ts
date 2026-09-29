/**
 * Shared by `piece-to-credential-integration.ts` and `activepieces-backend.ts` — split into its own
 * module so those two don't import each other (the backend needs the naming convention to resolve a
 * bound `trigger-function`'s qualified name back to the piece's own raw trigger name, the translator
 * builds the descriptor that declares it).
 */
export const activepiecesVendorFor = (pieceName: string): string => `activepieces-${pieceName}`;

/**
 * `ITriggerDescriptor.name`/`signalName` must be globally unique across every vendor's triggers (see
 * `@falang/workflow-integrations-common`'s `build-node-config.ts` — `name` becomes a real
 * `NodesStack`-registered node kind, and `compile-trigger-function.ts` matches `signalName` off it) —
 * a piece's own trigger name (e.g. `new_post`) isn't qualified by vendor on its own, unlike Telegram's
 * hand-picked `'telegram-trigger'` constant. Same string serves both `name` and `signalName`; nothing
 * requires them to differ.
 */
export const activepiecesTriggerNameFor = (pieceName: string, triggerName: string): string =>
  `${pieceName}-${triggerName}`;
