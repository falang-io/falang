import { getGlobalI18n } from '@falang/scheme';
import { useClientExtensions } from '../extensions/client-extensions.js';

/** The community name of the built-in AI provider ("Built-in provider" / «Встроенный провайдер»). */
export const DEFAULT_AI_PROVIDER_NAME_KEY = 'client:ai-provider.name';

/**
 * The built-in AI provider's display name (ADR 0081 (private)): the host's ready string for `language`
 * (`IClientExtensions.aiProviderName`; an exact match, else the base language — `ru` for `ru-RU`), else the i18n
 * default.
 */
export const resolveAiProviderName = (
  names: Readonly<Record<string, string>> | undefined,
  language: string,
  translate: (key: string) => string,
): string => {
  const exact = names?.[language];
  if (exact) return exact;
  const base = names?.[language.split('-')[0] ?? language];
  if (base) return base;
  return translate(DEFAULT_AI_PROVIDER_NAME_KEY);
};

/** `resolveAiProviderName` for the current UI language and the host's extensions; re-renders an observer on a language change. */
export const useAiProviderName = (): string => {
  const names = useClientExtensions().aiProviderName;
  const i18n = getGlobalI18n();
  return resolveAiProviderName(names, i18n.language, i18n.t);
};
