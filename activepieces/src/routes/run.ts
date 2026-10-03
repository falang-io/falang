import { Router } from 'express';
import { getPiece } from '../pieces/registry.js';
import { buildActionContext } from '../pieces/context.js';
import { resolveAuthValue } from '../pieces/auth-resolver.js';
import { NotFoundError } from '../credentials.js';
import { requireProjectToken } from '../project-token-middleware.js';
import { runWithPieceEgress } from '../egress/index.js';

export const runRouter = Router();

/**
 * Synchronous action execution — see ADR 0010's service contract. `credentialId` is resolved to a
 * real secret in this process only; it never reaches `runner` or any compiled activity code.
 * Authenticated by the caller's own per-project token (`x-internal-project-token` + body `projectId`,
 * verified against `backend`) — NOT the shared service secret, which runner pods never hold. They come from the caller (a runner pod's `runActivepiecesAction`
 * activity — see `compile-activities.ts`) and are forwarded to `resolveAuthValue`, which needs them
 * to call `backend`'s per-project-scoped credential resolver — see
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth".
 */
runRouter.post(
  '/credentials/:credentialId/pieces/:pieceName/actions/:actionName/run',
  requireProjectToken,
  async (req, res) => {
    const { credentialId, pieceName, actionName } = req.params as Record<
      'credentialId' | 'pieceName' | 'actionName',
      string
    >;
    const propsValue = (req.body?.propsValue ?? {}) as Record<string, unknown>;
    const projectId = req.body?.projectId as string | undefined;
    // Verified by `requireProjectToken` against `projectId` (taken from the header, never the body).
    const internalProjectToken = res.locals['internalProjectToken'] as string | undefined;
    if (!projectId || !internalProjectToken) {
      res.status(400).json({ message: '"projectId" is required' });
      return;
    }

    try {
      const piece = getPiece(pieceName);
      const action = piece.getAction(actionName);
      if (!action) {
        res.status(404).json({ message: `Action "${actionName}" not found on piece "${pieceName}"` });
        return;
      }

      const result = await runWithPieceEgress(pieceName, { projectId, internalProjectToken }, async () => {
        const authValue = await resolveAuthValue(pieceName, piece, credentialId, projectId, internalProjectToken);
        const context = buildActionContext(propsValue, authValue);
        return action.run(context);
      });
      res.json({ result });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ message: error.message });
        return;
      }
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
);
