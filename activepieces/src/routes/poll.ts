import { Router } from 'express';
import { TriggerStrategy } from '@activepieces/shared';
import { getPiece } from '../pieces/registry.js';
import { buildTriggerContext, createTriggerStore } from '../pieces/context.js';
import { resolveAuthValue } from '../pieces/auth-resolver.js';
import { NotFoundError } from '../credentials.js';
import { runWithPieceEgress } from '../egress/index.js';

export const pollRouter = Router();

/**
 * One `Store`-backing `Map` per `credentialId`/`pieceName`/`triggerName`, kept for this process's
 * lifetime — see ADR 0011's "Dedup/poll state lives in `activepieces/`'s process memory". A restart
 * loses it, same tolerance already accepted for Telegram's in-memory poll `offset`.
 */
const triggerStates = new Map<string, Map<string, unknown>>();
/** Tracks which keys have already had `onEnable` run once — required before the first `run()` so pieces like WordPress can seed `lastPoll`/`lastItem` to "now" instead of replaying history. */
const enabledTriggers = new Set<string>();

const triggerStateKey = (credentialId: string, pieceName: string, triggerName: string): string =>
  `${credentialId}:${pieceName}:${triggerName}`;

/**
 * Polled by `@falang/workflow-integrations-activepieces`'s `registerBackend` on an interval — see
 * ADR 0011 ("`backend` schedules, `activepieces/` executes"). Body `{ propsValue, projectId,
 * internalProjectToken }` (the latter two per ADR 0016 (private)'s "Namespace/RBAC model and
 * inter-pod auth" — forwarded to `resolveAuthValue`), response `{ items }` (whatever `trigger.run()`
 * returned, unstructured per-piece JSON).
 */
pollRouter.post('/credentials/:credentialId/pieces/:pieceName/triggers/:triggerName/poll', async (req, res) => {
  const { credentialId, pieceName, triggerName } = req.params;
  const propsValue = (req.body?.propsValue ?? {}) as Record<string, unknown>;
  const projectId = req.body?.projectId as string | undefined;
  const internalProjectToken = req.body?.internalProjectToken as string | undefined;
  if (!projectId || !internalProjectToken) {
    res.status(400).json({ message: '"projectId"/"internalProjectToken" are required' });
    return;
  }

  try {
    const piece = getPiece(pieceName);
    const trigger = piece.getTrigger(triggerName);
    if (!trigger) {
      res.status(404).json({ message: `Trigger "${triggerName}" not found on piece "${pieceName}"` });
      return;
    }
    if (trigger.type !== TriggerStrategy.POLLING) {
      res.status(400).json({ message: `Trigger "${triggerName}" is not a polling trigger (see ADR 0011's scope)` });
      return;
    }

    const items = await runWithPieceEgress(pieceName, { projectId, internalProjectToken }, async () => {
      const authValue = await resolveAuthValue(pieceName, piece, credentialId, projectId, internalProjectToken);
      const key = triggerStateKey(credentialId, pieceName, triggerName);
      let state = triggerStates.get(key);
      if (!state) {
        state = new Map<string, unknown>();
        triggerStates.set(key, state);
      }
      const context = buildTriggerContext(propsValue, authValue, createTriggerStore(state));

      if (!enabledTriggers.has(key)) {
        await trigger.onEnable(context as unknown as Parameters<typeof trigger.onEnable>[0]);
        enabledTriggers.add(key);
      }

      return trigger.run(context as unknown as Parameters<typeof trigger.run>[0]);
    });
    res.json({ items });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});
