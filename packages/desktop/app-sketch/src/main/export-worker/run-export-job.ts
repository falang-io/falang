import { runInWorkerProcess } from '@falang/desktop-worker-process';
import type {
  IExportWorkerProgress,
  TExportWorkerJob,
  TExportWorkerResult,
} from '../../shared/export-worker-protocol.js';
import { resolveExportWorkerCommand } from './resolve-export-worker-command.js';

/**
 * Tracks one in-flight worker process per request id, the same "renderer generates an id,
 * `*Cancel(requestId)` looks it up" pattern `agent-chat-handler.ts` uses for `agentChat`/
 * `agentChatCancel` (see its own doc comment) — needed here for the same reason: `ipcRenderer.invoke`
 * has no built-in cancellation, and this one additionally has no `AbortSignal` to plumb through (it's
 * a whole child process, not a `fetch`), so `cancel()` means killing that process outright.
 */
const inFlight = new Map<
  string,
  ReturnType<typeof runInWorkerProcess<TExportWorkerJob, IExportWorkerProgress, TExportWorkerResult>>
>();

export const runExportJob = async (
  requestId: string,
  job: TExportWorkerJob,
  onProgress: (progress: IExportWorkerProgress) => void,
): Promise<TExportWorkerResult> => {
  const handle = runInWorkerProcess<TExportWorkerJob, IExportWorkerProgress, TExportWorkerResult>({
    command: resolveExportWorkerCommand(),
    job,
    onProgress,
  });
  inFlight.set(requestId, handle);
  try {
    return await handle.result;
  } finally {
    inFlight.delete(requestId);
  }
};

export const cancelExportJob = (requestId: string): void => {
  inFlight.get(requestId)?.cancel();
};
