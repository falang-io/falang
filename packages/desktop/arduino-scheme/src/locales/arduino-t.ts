import { getGlobalI18n } from '@falang/scheme';

/** The i18n namespace of this package's own strings (`locales/{en,ru}.json`, registered by `ArduinoSchemeLocalesModule`). */
export const ARDUINO_SCHEME_NS = 'arduino-scheme';

/**
 * A block field label (`label.<key>` in the namespace). Read inside an `observer` render, so it follows a language change:
 * `I18NStore.t` is an observable reference that is replaced when a language's bundle loads or the language switches.
 */
export const tl = (key: string): string => getGlobalI18n().t(`${ARDUINO_SCHEME_NS}:label.${key}`);

/** A node kind's block title / menu label, `title.<nodeName>` in the namespace — resolved at call time. */
export const nodeTitle = (nodeName: string): string => getGlobalI18n().t(`${ARDUINO_SCHEME_NS}:title.${nodeName}`);

/** The i18n key stored as an icon's `title` (`block-view.tsx` resolves it with `t`). */
export const nodeTitleKey = (nodeName: string): string => `${ARDUINO_SCHEME_NS}:title.${nodeName}`;
