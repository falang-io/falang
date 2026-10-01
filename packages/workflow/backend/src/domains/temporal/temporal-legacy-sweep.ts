import type { Client } from '@temporalio/client';

/**
 * Pauses every Falang-created schedule (memo `falangProjectId`) still living in the legacy shared
 * namespace — after switching to `per-project` the same schedules are re-created in each project's own
 * namespace, so the old ones would fire a second time against workflows nobody serves. Idempotent: an
 * already-paused schedule is skipped. Returns the ids it paused. ADR 0050 (private), "Migration".
 */
export const pauseLegacyNamespaceSchedules = async (client: Client, note: string): Promise<string[]> => {
  const paused: string[] = [];
  for await (const summary of client.schedule.list()) {
    if (typeof summary.memo?.falangProjectId !== 'string') continue;
    if (summary.state.paused) continue;
    // oxlint-disable-next-line no-await-in-loop -- a handful of schedules; sequential keeps the load flat.
    await client.schedule.getHandle(summary.scheduleId).pause(note);
    paused.push(summary.scheduleId);
  }
  return paused;
};
