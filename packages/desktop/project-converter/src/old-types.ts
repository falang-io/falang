/**
 * Loose types for the old (`@falang/editor-scheme`-era, `schemeVersion: 2`) on-disk project
 * format — `project.falangproject.json` + `falang/schemas/**\/*.falang.json`. Deliberately not a
 * zod schema: these files are read defensively (an unrecognized `alias` throws a clear error
 * naming the source file) rather than validated up front, since the real shape varies more than
 * any one strict schema would tolerate (e.g. `variableType` is `null` on non-typed expressions).
 *
 * Field shapes below are taken from reading every real `*.falang.json` under
 * `/home/serginho/Work/ffalang/old/resources` (not part of this repo — see
 * ADR 0005 (private)'s "Implementation notes (old-format project
 * migration)" for how this mapping was derived) — except `lifegram_root`, `parallel`,
 * `pseudo-cycle` and `while`, for which no real sample exists; those are modelled by analogy with
 * `if`/`switch` (both confirmed to use a flat `children` array in the real `schemeVersion: 2`
 * format, unlike the nested `.variants`/`.switches` wrapper the old app's own 1→2 converter,
 * `old/packages/editor/ide/src/project-converters/convert1to2.ts`, used for the older v1 shape).
 */

export interface IOldProjectManifest {
  name: string;
  type: string;
  version: number;
}

export type TOldNumberTypeDetail =
  | { type: 'integer'; integerType: string }
  | { type: 'float'; floatType: string }
  | { type: 'decimal'; digits: number; decimals: number }
  | { type: 'any' };

export interface IOldVariableType {
  type: string;
  constant?: boolean;
  optional?: boolean;
  // number
  numberType?: string | TOldNumberTypeDetail;
  integerType?: string;
  floatType?: string;
  digits?: number;
  decimals?: number;
  // array
  elementType?: IOldVariableType;
  dimensions?: number;
  // struct
  iconId?: string;
  schemeId?: string;
  name?: string;
  properties?: unknown;
}

export interface IOldFunctionParameter {
  name: string;
  type: IOldVariableType;
}

export interface IOldBlock {
  width?: number;
  color?: string;
  /** `text`-domain leaf content. */
  text?: string;
  /** `code`-domain leaf content. */
  code?: string;
  /** `create_var`/`assign_var`/`log`/`if`/`switch`/`switch`-option condition/case expression. */
  expression?: string;
  /** `ExpressionBlockDto.type` — `'create'|'assign'|'boolean'|'string'|'number'|'array'|'scalar'|'value'|'newName'`. */
  type?: string;
  variableType?: IOldVariableType | null;
  // function
  parameters?: IOldFunctionParameter[];
  returnValue?: IOldVariableType;
  name?: string;
  // foreach
  arr?: string;
  item?: string;
  index?: string;
  // from_to_cycle
  from?: string;
  to?: string;
  // arr_push/arr_pop/arr_shift/arr_unshift
  variable?: string;
  // call_function/call_api
  schemeId?: string;
  iconId?: string | null;
  parametersList?: string[];
  returnVariable?: string;
}

export interface IOldOut {
  id: string;
  alias: string;
  /** `'break' | 'continue' | 'return' | 'throw'`. */
  type: string;
  level: number;
  block?: IOldBlock;
}

export interface IOldIcon {
  id: string;
  alias: string;
  block?: IOldBlock;
  children?: IOldIcon[];
  out?: IOldOut | null;
  gaps?: number[];
  trueOnRight?: boolean;
  trueIsMain?: boolean;
  /** Text-domain "side icon" (the timer): `{ id, alias, block: { text } }`, see ADR 0049 (private). */
  leftSide?: IOldIcon;
  // function
  header?: IOldBlock;
  footer?: IOldBlock;
  // lifegram (best-effort, unverified — see module doc)
  headerBlock?: IOldBlock;
  functions?: IOldLifegramFunction[];
  finish?: IOldLifegramFinish;
}

export interface IOldLifegramFunction {
  id: string;
  alias: string;
  block?: IOldBlock;
  children?: IOldIcon[];
  returns?: IOldBlock[];
  returnGaps?: number[];
}

export interface IOldLifegramFinish {
  id: string;
  alias: string;
  block?: IOldBlock;
  children?: IOldIcon[];
  return?: IOldBlock;
}

export interface IOldScheme {
  id: string;
  schemeVersion: number;
  name: string;
  description?: string;
  /** Document kind: `'function' | 'lifegram' | 'object_definition' | 'logic_external_apis' | 'logic_enum'`. */
  type: string;
  root: IOldIcon;
}

/** call_function/call_api's own `parameters` field is a plain `string[]`, unlike `IOldFunctionParameter[]`. */
export interface IOldCallBlock {
  schemeId: string;
  iconId?: string | null;
  parameters: string[];
  returnVariable: string;
  width?: number;
}
