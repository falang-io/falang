import type { TExportLanguage } from '@falang/logic-dto';

/** Languages this package can currently compile an expression into — extended incrementally, see ADR 0019 (private). */
export const IMPLEMENTED_LANGUAGES: readonly TExportLanguage[] = ['ts', 'js', 'cpp', 'golang', 'rust', 'sharp'];
