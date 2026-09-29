import type { ITriggerDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { registerActivepiecesBackend } from './activepieces-backend.js';
import type { IActivepiecesPieceCatalogEntry, IActivepiecesTriggerCatalogEntry } from './catalog-types.js';
import { activepiecesTriggerNameFor, activepiecesVendorFor } from './naming.js';

/** Fixed identifier the compiled `trigger-function` binds a polled item's payload to — see `ITriggerDescriptor.scopeVariableName`. */
const ACTIVEPIECES_SCOPE_VARIABLE_NAME = 'item';

/**
 * See ADR 0011 (private)'s Decision 1. `scopeType: { type: 'any' }` because
 * a piece trigger's `run()` returns arbitrary per-piece JSON with no structured `TVariableInfo` — same
 * gap `webhook.integration.ts`'s own trigger already accepts for the same reason. `contextFields`
 * downgrades every prop to `kind: 'text'` (the only kind `ITriggerDescriptor.contextFields` supports),
 * same "v1 gap: raw text" treatment `0010`'s action mapping table applies to comparable action props.
 */
// `notes` is required on `ITriggerDescriptor` (see its own doc comment), but there's no per-trigger
// prose to hand-write across potentially hundreds of catalog entries — the ActivePieces catalog
// already carries real, human-written text for each one (`displayName`/`description`, not i18n keys),
// so this composes `notes` from that mechanically rather than leaving it blank. `scopeType: any`
// itself is worth calling out since (unlike a hand-authored vendor's trigger) there's no fixed struct
// to point an agent at instead.
const buildTriggerNotes = (pieceName: string, trigger: IActivepiecesTriggerCatalogEntry): string => {
  const description = trigger.description.trim();
  const summary = `ActivePieces "${pieceName}" trigger "${trigger.displayName}"${description ? `: ${description}` : '.'}`;
  return (
    `${summary} Payload shape is this trigger's own arbitrary JSON (scopeType: any, no fixed struct) — ` +
    'read whatever fields it sends off the bound scope variable rather than assuming one shape.'
  );
};

const buildTriggerDescriptor = (pieceName: string, trigger: IActivepiecesTriggerCatalogEntry): ITriggerDescriptor => {
  const qualifiedName = activepiecesTriggerNameFor(pieceName, trigger.name);
  return {
    name: qualifiedName,
    label: trigger.displayName,
    notes: buildTriggerNotes(pieceName, trigger),
    scopeType: { type: 'any' },
    scopeVariableName: ACTIVEPIECES_SCOPE_VARIABLE_NAME,
    signalName: qualifiedName,
    webhookPath: `/webhooks/${activepiecesVendorFor(pieceName)}/:credentialId/:env`,
    ...(trigger.props.length > 0
      ? {
          contextFields: trigger.props.map((prop) => ({
            name: prop.name,
            label: prop.displayName,
            kind: 'text' as const,
          })),
        }
      : {}),
  };
};

/**
 * Maps a catalog entry into the generic credentials/trigger system's shape — `vendor`+
 * `credentialFields` per ADR 0010 (private), `triggers` per
 * ADR 0011 (private). `actions` stays hardcoded empty:
 * `credentials-codec.ts`'s encode/mask/strip/resolve functions only ever read `vendor`+
 * `credentialFields`, and the `activepieces-action` node kind (`@falang/workflow-dto`) doesn't route
 * through `IActionDescriptor` at all — see 0010. `triggers`, unlike `actions`, DOES route through the
 * existing `IWorkflowIntegration.triggers[]`/`trigger-function` pipeline, since it fits as-is — see
 * 0011's Decision 1.
 */
/** Same mechanical approach as `buildTriggerNotes` — the piece catalog has no piece-level description,
 *  so the vendor's `notes` are its display name plus every action/trigger display name, which is what a
 *  keyword search (`search_integrations`) needs to find it. */
const buildVendorNotes = (piece: IActivepiecesPieceCatalogEntry): string => {
  const capabilities = [
    ...piece.actions.map((action) => action.displayName),
    ...piece.triggers.map((trigger) => `trigger: ${trigger.displayName}`),
  ];
  return `ActivePieces piece "${piece.displayName}" (${piece.pieceName})${capabilities.length > 0 ? `: ${capabilities.join('; ')}.` : '.'}`;
};

export const pieceToCredentialIntegration = (piece: IActivepiecesPieceCatalogEntry): IWorkflowIntegration => ({
  vendor: activepiecesVendorFor(piece.pieceName),
  label: piece.displayName,
  notes: buildVendorNotes(piece),
  credentialFields: (piece.auth?.fields ?? []).map((field) => {
    const credentialField: {
      name: string;
      label: string;
      kind: 'text' | 'secret';
      hidden?: boolean;
      secretProdOptional?: boolean;
    } = { name: field.name, label: field.displayName, kind: field.kind };
    if (field.hidden) credentialField.hidden = true;
    if (field.secretProdOptional) credentialField.secretProdOptional = true;
    return credentialField;
  }),
  ...(piece.auth?.oauth2 ? { oauth2: { ...piece.auth.oauth2 } } : {}),
  triggers: piece.triggers.map((trigger) => buildTriggerDescriptor(piece.pieceName, trigger)),
  actions: [],
  ...(piece.triggers.length > 0
    ? { registerBackend: registerActivepiecesBackend(piece.pieceName, piece.triggers) }
    : {}),
});
