// oxlint-disable no-console -- deliberate, throttled diagnostic; see the comment below.
import { useService } from '@falang/scheme';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../typescript-project-service/typescript-project.service.token.js';
import type { TCodeTheme } from '../typescript-project-service/typescript-project.service.js';

/** Logged at most once per process — this fallback firing at all means some render tree using
 * Monaco/Prism-backed code views has no `TypescriptProjectService` anywhere in its DI container
 * chain (a `registerTypescriptProjectService(...)` call missing upstream, or a component rendering
 * outside any scheme's `ContainerContext`), so it can never actually know the host app's real
 * theme — the `'light'` result below is a guess, not a resolved value, and a host whose own chrome
 * is dark (e.g. the workflow product's client) will show visibly mismatched Prism/Monaco colors
 * against a dark UI. Surfaced once via `console.warn` instead of silently, so a future desync
 * between "this host is dark" and "this render tree has no TypescriptProjectService" is
 * diagnosable from the console rather than needing to be rediscovered by hand each time (see
 * ADR 0005 (private)'s "Implementation notes" for the live-diagnosis pass that found this
 * fallback had no signal at all when it fires; `packages/desktop/app-sketch` and
 * `packages/desktop/app-arduino` are both light and call `TypescriptProjectService.setTheme('light')`
 * explicitly, so this fallback never fires for either of them — see ADR 0005 (private)'s
 * "Implementation notes (light theme for app-sketch …)" and ADR 0020 (private)'s "Implementation
 * notes (light theme for app-arduino …)"). */
let hasWarnedAboutMissingProjectService = false;

export const useCodeTheme = (): TCodeTheme => {
  try {
    return useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).theme;
  } catch (error) {
    if (!hasWarnedAboutMissingProjectService) {
      hasWarnedAboutMissingProjectService = true;
      console.warn(
        '[useCodeTheme] TOKEN_TYPESCRIPT_PROJECT_SERVICE could not be resolved — falling back to the ' +
          "'light' theme, which may not match this host's real theme. This usually means " +
          "registerTypescriptProjectService(...) was never called on this render tree's DI container " +
          "chain, or this component rendered outside any scheme's ContainerContext.",
        error,
      );
    }
    return 'light';
  }
};
