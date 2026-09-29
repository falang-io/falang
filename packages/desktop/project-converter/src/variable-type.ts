import type { TFloatType, TIntegerType, TNumberTypeDetail, TTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import type { IOldVariableType } from './old-types.js';

const convertNumberTypeDetail = (old: IOldVariableType): TNumberTypeDetail => {
  const numberType = old.numberType;
  if (typeof numberType === 'object' && numberType !== null) {
    // Already-nested shape (defensive — every real sample is flattened, see module doc below).
    return numberType as TNumberTypeDetail;
  }
  switch (numberType) {
    case 'integer': {
      if (!old.integerType) throw new Error('Old integer variable type is missing "integerType"');
      return { type: 'integer', integerType: old.integerType as TIntegerType };
    }
    case 'float': {
      if (!old.floatType) throw new Error('Old float variable type is missing "floatType"');
      return { type: 'float', floatType: old.floatType as TFloatType };
    }
    case 'decimal': {
      if (typeof old.digits !== 'number' || typeof old.decimals !== 'number')
        throw new Error('Old decimal variable type is missing "digits"/"decimals"');
      return { type: 'decimal', digits: old.digits, decimals: old.decimals };
    }
    default: {
      return { type: 'any' };
    }
  }
};

/**
 * The only real structural difference between the old and new `TVariableInfo` shapes: the old
 * format flattens a number's sub-kind (`{type:'number', numberType:'integer', integerType:'int32'}`),
 * while the new one nests it (`{type:'number', numberType:{type:'integer', integerType:'int32'}}`,
 * see `packages/typescript/dto/src/dtos/types.ts`). Everything else carries over field-for-field —
 * confirmed against every real `variableType`/`returnValue`/`parameters[].type` in
 * `old/resources` (not part of this repo, see ADR 0005 (private)).
 *
 * `struct` drops the old `schemeId`/`name`/`properties` (denormalized display data) and keeps only
 * `iconId` (renamed `id`) — `TypesRegistryStore` indexes an object type by its defining
 * `objects-structure-thread` node's own id alone, globally unique, so `schemeId` is redundant (see
 * `packages/typescript/scheme/src/utils/update-types-registry-from-i-node.ts`). This converter
 * keeps every old node id stable, so the old struct's `iconId` *is* that thread node's new id.
 *
 * `enum` (`{type:'enum', schemeId, iconId}`) is carried over as-is — no real old sample exists to
 * confirm this shape end-to-end (see `old-types.ts`'s module doc), best-effort.
 */
export const convertTypeInfo = (old: IOldVariableType): TTypeInfo => {
  switch (old.type) {
    case 'string': {
      return { type: 'string' };
    }
    case 'boolean': {
      return { type: 'boolean' };
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
    case 'number': {
      return { type: 'number', numberType: convertNumberTypeDetail(old) };
    }
    case 'array': {
      if (!old.elementType) throw new Error('Old array variable type is missing "elementType"');
      return { type: 'array', elementType: convertTypeInfo(old.elementType), dimensions: old.dimensions ?? 1 };
    }
    case 'struct': {
      if (!old.iconId) throw new Error('Old struct variable type is missing "iconId"');
      return { type: 'struct', id: old.iconId };
    }
    case 'enum': {
      if (!old.schemeId || !old.iconId) throw new Error('Old enum variable type is missing "schemeId"/"iconId"');
      return { type: 'enum', schemeId: old.schemeId, iconId: old.iconId };
    }
    default: {
      throw new Error(`Unsupported old variable type: ${old.type}`);
    }
  }
};

export const convertVariableInfo = (old: IOldVariableType): TVariableInfo => {
  const base = convertTypeInfo(old);
  return {
    ...base,
    ...(typeof old.constant === 'boolean' ? { constant: old.constant } : {}),
    ...(typeof old.optional === 'boolean' ? { optional: old.optional } : {}),
  } as TVariableInfo;
};
