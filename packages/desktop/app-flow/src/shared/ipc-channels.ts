export const IPC = {
  /** main -> splash: a {@link IFlowSplashState} update. */
  backendStatus: 'backend:status',
  /** splash -> main: the current state (the page may load after the first update). */
  getBackendState: 'backend:get-state',
  openDataFolder: 'app:open-data-folder',
  quit: 'app:quit',
} as const;

export type TFlowSplashState =
  | { readonly kind: 'starting'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string; readonly logTail: string };
