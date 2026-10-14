import { variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import {
  ARRAY_TYPE_ALIAS_DECL,
  ARRAY_UNKNOWN_TYPE_EXPRESSION,
  buildArrayElementTypeExpression,
  buildArrayTypeExpression,
} from '@falang/typescript-common';
import { buildTemplateStringHiddenWrap } from '../monaco/scope/build-template-string-hidden-wrap.js';
import { buildTypedValueHiddenPrefix } from '../monaco/scope/typed-value-hidden-prefix.js';

/**
 * The hidden prefixes of fields whose expected type is computed from other values of the same block. Shared by the
 * block editor stores (live values) and the field descriptors (stored values), so the editor and the background
 * check build identical code.
 */

/** An `arr` field: the scope plus a forced "some array" type. */
export const arrayFieldPrefix = (scopeCode: string): string =>
  buildTypedValueHiddenPrefix(scopeCode + ARRAY_TYPE_ALIAS_DECL, ARRAY_UNKNOWN_TYPE_EXPRESSION);

/** A value pushed into the array typed in `arrValue`: the scope plus a forced element type. */
export const arrayElementValuePrefix = (scopeCode: string, arrValue: string): string =>
  buildTypedValueHiddenPrefix(scopeCode, buildArrayElementTypeExpression(arrValue));

/** Items inserted into the array typed in `arrValue`: the scope plus the array's own type. */
export const arrayOfSameTypePrefix = (scopeCode: string, arrValue: string): string =>
  buildTypedValueHiddenPrefix(scopeCode, buildArrayTypeExpression(arrValue));

/** `create-var`'s initial value: typed as the variable's own declared type. */
export const createVarValuePrefix = (scopeCode: string, variableType: TVariableInfo): string =>
  buildTypedValueHiddenPrefix(scopeCode, variableInfoToTsType(variableType));

/** A returned value: `typeof returnValue` in a function that returns something, the bare scope otherwise. */
export const returnValuePrefix = (scopeCode: string, returnsValue: boolean, returnValueName: string): string =>
  returnsValue ? buildTypedValueHiddenPrefix(scopeCode, `typeof ${returnValueName}`) : scopeCode;

export { buildTemplateStringHiddenWrap };
