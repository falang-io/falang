import { getGlobalI18n, TOKEN_I18N, useService } from '@falang/scheme';

const DEFAULTS: Record<string, string> = {
  'print-export:title': 'Export to PDF',
  'print-export:hint': 'One page per document. Format is chosen per scheme (A4–A1).',
  'print-export:all': 'All',
  'print-export:active-only': 'Active document only',
  'print-export:print': 'Print',
  'print-export:cancel': 'Cancel',
  'print-export:nothing': 'No documents to print',
  'print-export:save-pdf': 'Save as PDF',
  'print-export:close': 'Close',
  'print-export:measuring': 'Measuring…',
  'print-export:timeout': 'Layout did not settle',
  'print-export:portrait': 'portrait',
  'print-export:landscape': 'landscape',
};

const resolveTranslate = (): ((key: string) => string) => {
  try {
    return useService(TOKEN_I18N).t as unknown as (key: string) => string;
  } catch {
    return getGlobalI18n().t as unknown as (key: string) => string;
  }
};

/**
 * Same `useT`-with-fallback as `ant-version-history` (works inside and outside a scheme's container), plus
 * English defaults so a host that ships no `print-export:` bundle still shows readable text.
 */
export const usePrintExportT = (): ((key: string) => string) => {
  const translate = resolveTranslate();
  return (key) => {
    const value = translate(key);
    return value === key ? (DEFAULTS[key] ?? key) : value;
  };
};
