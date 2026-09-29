export type Locale = 'en' | 'ru';

const value = process.env.SITE_LOCALE;
if (value !== 'en' && value !== 'ru') {
  throw new Error(`SITE_LOCALE env var must be "en" or "ru", got: ${JSON.stringify(value)}`);
}

// One locale per build — docs.falang.io is built with SITE_LOCALE=en, docs.falang.ru with
// SITE_LOCALE=ru. There is no runtime language switch: each domain only ever ships its own
// locale's static output. Mirrors ../../site/src/i18n/locale.ts.
export const locale: Locale = value;
