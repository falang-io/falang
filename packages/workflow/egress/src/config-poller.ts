import type { IEgressProxyConfig } from './types.js';

export interface IEgressConfigPoller {
  get(): IEgressProxyConfig | null;
  /** Resolves after the first load attempt, successful or not; never rejects. */
  ready: Promise<void>;
  dispose(): void;
}

/**
 * Keeps a fresh in-memory copy of the proxy config so the dispatcher can stay synchronous. A failed refresh keeps the
 * last good value (one warning per failure streak).
 */
export const createEgressConfigPoller = (params: {
  load: () => Promise<IEgressProxyConfig | null>;
  intervalMs?: number;
}): IEgressConfigPoller => {
  let current: IEgressProxyConfig | null = null;
  let failing = false;
  let disposed = false;

  const refresh = async (): Promise<void> => {
    try {
      const next = await params.load();
      if (disposed) return;
      current = next;
      failing = false;
    } catch (error) {
      // oxlint-disable-next-line no-console -- one warning per failure streak; no logging framework in this package
      if (!failing) console.warn('[egress] failed to load proxy config, keeping the last value:', error);
      failing = true;
    }
  };

  const ready = refresh();
  const timer = setInterval(() => {
    // oxlint-disable-next-line no-void -- refresh never rejects
    void refresh();
  }, params.intervalMs ?? 30_000);
  timer.unref();

  return {
    get: () => current,
    ready,
    dispose: () => {
      disposed = true;
      clearInterval(timer);
    },
  };
};
