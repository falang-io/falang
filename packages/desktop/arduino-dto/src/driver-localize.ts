import type { IDriverConfig, IDriverFieldDescriptor, IDriverLocaleField } from './driver-config.js';

/** `ru-RU` → `ru`; the language code a `locales` entry is keyed by. */
const baseLanguage = (language: string): string => language.split('-')[0] ?? language;

const localizeFields = (
  fields: readonly IDriverFieldDescriptor[],
  localized: Readonly<Record<string, IDriverLocaleField>> | undefined,
): IDriverFieldDescriptor[] =>
  fields.map((field) => {
    const overlay = localized?.[field.name];
    if (!overlay) return field;
    return {
      ...field,
      label: overlay.label ?? field.label,
      ...(field.options
        ? {
            options: field.options.map((option) => ({
              ...option,
              label: overlay.options?.[option.value] ?? option.label,
            })),
          }
        : {}),
    };
  });

/**
 * The driver config with every user-visible label (driver, action, field, select option) replaced by its
 * `locales[language]` translation where there is one — anything untranslated keeps the English base text. Pure data in,
 * data out (the result still validates as a driver config; `locales` is kept so callers can re-localize). Only labels
 * change: ids, templates and `notes` are untouched, so a localized copy is for display only and never compiled.
 */
export const localizeDriverConfig = (config: IDriverConfig, language: string): IDriverConfig => {
  const locale = config.locales?.[language] ?? config.locales?.[baseLanguage(language)];
  if (!locale) return config;
  return {
    ...config,
    label: locale.label ?? config.label,
    actions: config.actions.map((action) => {
      const overlay = locale.actions?.[action.id];
      if (!overlay) return action;
      return { ...action, label: overlay.label ?? action.label, fields: localizeFields(action.fields, overlay.fields) };
    }),
    ...(config.device
      ? { device: { ...config.device, fields: localizeFields(config.device.fields, locale.device?.fields) } }
      : {}),
  };
};
