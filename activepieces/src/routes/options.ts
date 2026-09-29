import { Router } from 'express';
import { getPiece } from '../pieces/registry.js';
import { buildPropertyContext } from '../pieces/context.js';
import { resolveAuthValue } from '../pieces/auth-resolver.js';
import { NotFoundError } from '../credentials.js';

export const optionsRouter = Router();

interface IDynamicDropdownProperty {
  readonly type?: string;
  readonly options?: (propsValue: Record<string, unknown>, ctx: unknown) => Promise<unknown>;
}

/**
 * Resolves a `Property.Dropdown`/`Property.MultiSelectDropdown` field's dynamic options — the
 * endpoint ADR 0010 described but never actually implemented (see ADR 0014 (private), which closes
 * this gap on the service side only: `normalize.ts` now flags a prop that needs this via
 * `refreshers`, but nothing in the client calls this route yet — building that UI is its own,
 * separate follow-up). `propsValue` (the action's OTHER current field values, needed for `refreshers`
 * to make sense) travels as a JSON-encoded query param since this is a `GET`, matching the ADR's
 * documented method. `projectId`/`internalProjectToken` (per ADR 0016 (private)'s "Namespace/RBAC
 * model and inter-pod auth") travel as plain query params for the same reason and are forwarded to
 * `resolveAuthValue` — the caller here is always `backend`'s own
 * `ActivepiecesFieldOptionsController`, which already knows both.
 */
optionsRouter.get(
  '/credentials/:credentialId/pieces/:pieceName/actions/:actionName/fields/:fieldName/options',
  async (req, res) => {
    const { credentialId, pieceName, actionName, fieldName } = req.params;
    const projectId = typeof req.query['projectId'] === 'string' ? req.query['projectId'] : undefined;
    const internalProjectToken =
      typeof req.query['internalProjectToken'] === 'string' ? req.query['internalProjectToken'] : undefined;
    if (!projectId || !internalProjectToken) {
      res.status(400).json({ message: '"projectId"/"internalProjectToken" query params are required' });
      return;
    }
    let propsValue: Record<string, unknown> = {};
    if (typeof req.query['propsValue'] === 'string') {
      try {
        propsValue = JSON.parse(req.query['propsValue']) as Record<string, unknown>;
      } catch {
        res.status(400).json({ message: '"propsValue" query param must be valid JSON' });
        return;
      }
    }

    try {
      const piece = getPiece(pieceName);
      const action = piece.getAction(actionName);
      if (!action) {
        res.status(404).json({ message: `Action "${actionName}" not found on piece "${pieceName}"` });
        return;
      }
      const field = (action.props as Record<string, IDynamicDropdownProperty>)[fieldName];
      if (!field) {
        res.status(404).json({ message: `Field "${fieldName}" not found on action "${pieceName}.${actionName}"` });
        return;
      }
      if (field.type !== 'DROPDOWN' && field.type !== 'MULTI_SELECT_DROPDOWN') {
        res.status(400).json({ message: `Field "${fieldName}" is not a dynamic dropdown (type "${field.type}")` });
        return;
      }
      if (typeof field.options !== 'function') {
        res.status(500).json({ message: `Field "${fieldName}" has no "options" resolver` });
        return;
      }

      const authValue = await resolveAuthValue(pieceName, piece, credentialId, projectId, internalProjectToken);
      const result = await field.options({ ...propsValue, auth: authValue }, buildPropertyContext());
      res.json(result);
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ message: error.message });
        return;
      }
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
);
