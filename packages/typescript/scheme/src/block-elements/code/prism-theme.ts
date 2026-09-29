import lightThemeCss from 'prismjs/themes/prism.css?raw';
import darkThemeCss from 'prismjs/themes/prism-tomorrow.css?raw';
import type { TCodeTheme } from '../../typescript-project-service/typescript-project.service.js';

const STYLE_ID = 'falang-prism-theme';

const themeCssByName: Record<TCodeTheme, string> = {
  light: lightThemeCss,
  dark: darkThemeCss,
};

export const applyPrismTheme = (theme: TCodeTheme): void => {
  let styleEl = document.querySelector<HTMLStyleElement>(`#${STYLE_ID}`);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.append(styleEl);
  }
  styleEl.textContent = themeCssByName[theme];
};
