import { getGlobalI18n, TOKEN_I18N, useService, type TFunction } from '@falang/scheme';

/**
 * `DebugPanel`'s own `useT` fallback pattern (`packages/core/antd/src/modules/ant-debug-panel`):
 * these panels are usually rendered inside a scheme's `ContainerContext` (the workflow client's
 * `Sidebar`), but also standalone with no open document (`RunSidebar`) — where `useService` throws.
 * Falls back to `getGlobalI18n()` rather than a plain identity function: `TOKEN_I18N` is registered
 * as a process-wide singleton (`registerGlobalTokens`), so a scheme's own child container and the
 * global accessor resolve the exact same `I18NStore` instance — the host's `version-history:`
 * bundle (registered once, globally, by `workflow-client-common`) is available either way.
 */
export const useVersionHistoryT = (): TFunction => {
  try {
    return useService(TOKEN_I18N).t;
  } catch {
    return getGlobalI18n().t;
  }
};
