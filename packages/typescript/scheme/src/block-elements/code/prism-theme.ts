import type { TCodeTheme } from '../../typescript-project-service/typescript-project.service.js';

const STYLE_ID = 'falang-prism-theme';

/** Prism theme stylesheets are host-installed (`@falang/typescript-scheme/src/browser.js`) — a `?raw` CSS import
 * can't be resolved outside a bundler, and this module must stay importable in plain Node. */
let themeCssByName: Partial<Record<TCodeTheme, string>> = {};

export const installPrismThemes = (themes: Record<TCodeTheme, string>): void => {
  themeCssByName = themes;
};

export const applyPrismTheme = (theme: TCodeTheme): void => {
  let styleEl = document.querySelector<HTMLStyleElement>(`#${STYLE_ID}`);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.append(styleEl);
  }
  styleEl.textContent = themeCssByName[theme] ?? '';
};
