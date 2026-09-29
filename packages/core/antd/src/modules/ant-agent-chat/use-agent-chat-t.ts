import { getGlobalI18n, TOKEN_I18N, useService, type TFunction } from '@falang/scheme';

/**
 * `DebugPanel`/`VersionHistoryPanel`'s own `useT` fallback pattern (see
 * `ant-version-history/use-version-history-t.ts`): this panel usually renders inside a scheme's
 * `ContainerContext`, but a host may also want to show it with no document open — falls back to
 * `getGlobalI18n()`, the same process-wide `I18NStore` instance either way, so the host's
 * `agent-chat:` bundle (registered once, globally, by each host) is available in both cases.
 */
export const useAgentChatT = (): TFunction => {
  try {
    return useService(TOKEN_I18N).t;
  } catch {
    return getGlobalI18n().t;
  }
};
