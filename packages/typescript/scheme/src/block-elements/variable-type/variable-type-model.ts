import { FloatTypes, IntegerTypes, type TTypeInfo, type TVariableInfo } from '@falang/typescript-dto';
import type {
  TNumberTypesMode,
  TypescriptProjectService,
} from '../../typescript-project-service/typescript-project.service.js';

/** What a type picker offers: the general types, with `number` split into `integer`/`float`/`decimal` in portable mode. */
export type TTypeChoice =
  | 'string'
  | 'boolean'
  | 'number'
  | 'integer'
  | 'float'
  | 'decimal'
  | 'array'
  | 'struct'
  | 'void'
  | 'enum'
  | 'any'
  | 'none'
  | '';

export const INTEGER_WIDTHS = IntegerTypes;
export const FLOAT_WIDTHS = FloatTypes;
export const DECIMAL_MAX_DIGITS = 18;
export const DEFAULT_INTEGER_WIDTH = 'int32';
export const DEFAULT_DECIMAL_DIGITS = 10;
export const DEFAULT_DECIMAL_DECIMALS = 2;

export interface IChoiceOptions {
  mode: TNumberTypesMode;
  /** The element type of an array: no `array`. */
  isElement?: boolean;
  allowVoid?: boolean;
  allowEnum?: boolean;
  /** An extra leading `none` choice (a missing return type). */
  allowNone?: boolean;
}

/** The choices a picker lists; `any` and `enum` only exist in `typescript` mode (no non-TS target compiles them). */
export const getTypeChoices = (options: IChoiceOptions): TTypeChoice[] => {
  const { mode, isElement = false, allowVoid = true, allowEnum = true, allowNone = false } = options;
  const portable = mode === 'portable';
  const choices: TTypeChoice[] = [];
  if (allowNone) choices.push('none');
  choices.push('string', 'boolean');
  if (portable) choices.push('integer', 'float', 'decimal');
  else choices.push('number');
  if (!isElement) choices.push('array');
  choices.push('struct');
  if (allowVoid) choices.push('void');
  if (!portable) {
    if (allowEnum) choices.push('enum');
    choices.push('any');
  }
  return choices;
};

/** The choice that represents an existing value; `''` = a number of no kind in portable mode (shown as empty, not silently replaced). */
export const choiceOf = (type: TTypeInfo | undefined, mode: TNumberTypesMode): TTypeChoice => {
  if (!type) return 'none';
  if (type.type !== 'number') return type.type === 'union' || type.type === 'never' ? 'any' : type.type;
  if (mode === 'typescript') return 'number';
  return type.numberType.type === 'any' ? '' : type.numberType.type;
};

/** Default value of a freshly picked choice: integer → int32, float → the project's default float, decimal → (10, 2), number → any. */
export const buildDefaultVariableType = (
  choice: TTypeChoice | 'never' | 'union',
  projectService: Pick<TypescriptProjectService, 'defaultFloatType'> | null,
): TVariableInfo => {
  switch (choice) {
    case 'string': {
      return { type: 'string' };
    }
    case 'boolean': {
      return { type: 'boolean' };
    }
    case 'integer': {
      return { type: 'number', numberType: { type: 'integer', integerType: DEFAULT_INTEGER_WIDTH } };
    }
    case 'float': {
      return {
        type: 'number',
        numberType: { type: 'float', floatType: projectService?.defaultFloatType ?? 'float64' },
      };
    }
    case 'decimal': {
      return {
        type: 'number',
        numberType: { type: 'decimal', digits: DEFAULT_DECIMAL_DIGITS, decimals: DEFAULT_DECIMAL_DECIMALS },
      };
    }
    case 'number': {
      return { type: 'number', numberType: { type: 'any' } };
    }
    case 'array': {
      return { type: 'array', elementType: { type: 'string' }, dimensions: 1 };
    }
    case 'struct': {
      return { type: 'struct', id: '' };
    }
    case 'enum': {
      return { type: 'enum', schemeId: '', iconId: '' };
    }
    case 'void': {
      return { type: 'void' };
    }
    case 'any': {
      return { type: 'any' };
    }
    case 'never': {
      return { type: 'never' };
    }
    case 'union': {
      return { type: 'union', unionTypes: [] };
    }
    default: {
      return { type: 'string' };
    }
  }
};

export const clampDecimalDigits = (digits: number): number =>
  Math.min(DECIMAL_MAX_DIGITS, Math.max(1, Math.trunc(Number.isFinite(digits) ? digits : DEFAULT_DECIMAL_DIGITS)));

export const clampDecimalDecimals = (decimals: number, digits: number): number =>
  Math.min(digits, Math.max(0, Math.trunc(Number.isFinite(decimals) ? decimals : 0)));
