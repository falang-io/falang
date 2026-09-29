/**
 * The wire protocol a worker process speaks back to whoever spawned it (`runInWorkerProcess`), over
 * Node's `fork`-style IPC channel (`spawn(..., { stdio: [..., 'ipc'] })`). One process handles exactly
 * one job for its whole lifetime — there is no job id / multiplexing, since `runInWorkerProcess` spawns
 * a fresh process per call (see its own doc comment for why).
 */
export type TWorkerOutboundMessage<TProgress, TResult> =
  | { readonly type: 'progress'; readonly progress: TProgress }
  | { readonly type: 'result'; readonly result: TResult }
  | { readonly type: 'error'; readonly message: string };
