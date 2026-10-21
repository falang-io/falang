import { TOKEN_I18N, useService } from '@falang/scheme';
import type { TTypeInfo } from '@falang/typescript-dto';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TNumberTypesMode } from '../../typescript-project-service/typescript-project.service.js';
import { describeVariableTypeForMode } from './describe-variable-type.js';

/** `t(key, english)` for the picker labels (namespace `variable-type`, en/ru in the package locales); English when no i18n service is around. */
export const useTypeLabel = (): ((key: string, fallback: string) => string) => {
  let t: ((key: string, options?: Record<string, unknown>) => string) | null = null;
  try {
    t = useService(TOKEN_I18N).t as unknown as (key: string, options?: Record<string, unknown>) => string;
  } catch {
    // no i18n service registered
  }
  return (key, fallback) => {
    if (!t) return fallback;
    const full = `variable-type:${key}`;
    const translated = t(full, { defaultValue: fallback });
    return translated === full ? fallback : translated;
  };
};

/** The project's number mode in a view component (`typescript` when no project service is around). */
export const useNumberTypesMode = (): TNumberTypesMode => {
  try {
    return useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).numberTypesMode;
  } catch {
    return 'typescript';
  }
};

/** Name of a type in view mode: the full number kind in portable mode (`int32`, `decimal(10,2)`), else the general type. */
export const viewTypeName = (type: TTypeInfo, mode: TNumberTypesMode): string =>
  type.type === 'number' ? describeVariableTypeForMode(type, mode) : type.type;
