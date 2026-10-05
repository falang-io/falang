import type { IModule, Scheme } from '@falang/scheme';
import { getGlobalI18n } from '@falang/scheme';

const MODULE_ID = 'arduino-scheme';

/** Registers this package's own strings (palette groups, pin/built-in node titles and field labels) on the shared `I18NStore`. */
export class ArduinoSchemeLocalesModule implements IModule {
  register(_scheme: Scheme): void {
    getGlobalI18n().register(MODULE_ID, {
      en: () => import('./en.json'),
      ru: () => import('./ru.json'),
    });
  }
}
