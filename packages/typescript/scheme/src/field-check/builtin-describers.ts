import type { NodeStore } from '@falang/scheme';
import type { TVariableInfo } from '@falang/typescript-dto';
import { buildTemplateStringHiddenWrap } from '../monaco/scope/build-template-string-hidden-wrap.js';
import { decodeLegacyHtml } from '../blocks/expression/decode-legacy-html.js';
import { isInValueReturningFunction, RETURN_VALUE_NAME } from '../blocks/return/return-value.js';
import type { ICheckedField, IFieldCheckContext } from './checked-field.js';
import { registerFieldDescriber, type TFieldDescriber } from './field-describer-registry.js';
import {
  arrayElementValuePrefix,
  arrayFieldPrefix,
  arrayOfSameTypePrefix,
  createVarValuePrefix,
  returnValuePrefix,
} from './prefix-builders.js';
import { buildForcedTypePrefix, buildNodeScopeCode, collectNodeScope } from './scope-context.js';

type TRecord = Record<string, unknown>;

const dataOf = (node: NodeStore): TRecord =>
  node.data !== null && typeof node.data === 'object' ? (node.data as TRecord) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A field checked against the bare scope. */
export const scopeField = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  field: string,
  value: string,
  extra: { skipValues?: readonly string[] } = {},
): ICheckedField => ({
  field,
  kind: 'code',
  prefix: buildNodeScopeCode(node, ctx.projectService),
  value,
  suffix: '',
  ...extra,
});

/** A field checked against the scope plus a forced expected type. */
export const typedField = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  field: string,
  value: string,
  type: TVariableInfo,
): ICheckedField => ({
  field,
  kind: 'code',
  prefix: buildForcedTypePrefix(node, ctx.projectService, type),
  value,
  suffix: '',
});

/** A text field with optional `${expr}` interpolation, checked as the body of a template literal. */
export const templateField = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  field: string,
  value: string,
): ICheckedField => {
  const wrap = buildTemplateStringHiddenWrap(buildNodeScopeCode(node, ctx.projectService));
  return { field, kind: 'code', prefix: wrap.hiddenPrefix, value, suffix: wrap.hiddenSuffix };
};

export const identifierField = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  field: string,
  value: string,
): ICheckedField => ({
  field,
  kind: 'identifier',
  value,
  scopeNames: collectNodeScope(node, ctx.projectService).map((variable) => variable.name),
});

const customField = (field: string, prefix: string, value: string, extra: Partial<ICheckedField> = {}): ICheckedField =>
  ({ field, kind: 'code', prefix, value, suffix: '', ...extra }) as ICheckedField;

const describeAction: TFieldDescriber = (node, ctx) => [scopeField(node, ctx, 'value', text(node.data))];

/** `while` / `switch` / `switch-option` / `throw`: `blocks/expression` (legacy HTML decoded, like the editor does). */
const describeExpression: TFieldDescriber = (node, ctx) => [
  scopeField(node, ctx, 'value', decodeLegacyHtml(text(node.data)), {
    // `default:` of a switch is valid but is not an expression.
    skipValues: node.name === 'switch-option' ? ['default'] : [],
  }),
];

const describeIf: TFieldDescriber = (node, ctx) => [
  typedField(node, ctx, 'value', text(node.data), { type: 'boolean' }),
];

const describeReturn: TFieldDescriber = (node, ctx) => {
  const returnsValue = isInValueReturningFunction(node);
  const decoded = decodeLegacyHtml(text(node.data));
  const value = decoded.trim() === '' && returnsValue ? RETURN_VALUE_NAME : decoded;
  return [
    customField(
      'value',
      returnValuePrefix(buildNodeScopeCode(node, ctx.projectService), returnsValue, RETURN_VALUE_NAME),
      value,
    ),
  ];
};

const describeLog: TFieldDescriber = (node, ctx) => [templateField(node, ctx, 'value', text(node.data))];

const describeCreateVar: TFieldDescriber = (node, ctx) => {
  const data = dataOf(node);
  const variableType = data['variableType'] as TVariableInfo | undefined;
  if (!variableType) return [];
  return [
    customField(
      'value',
      createVarValuePrefix(buildNodeScopeCode(node, ctx.projectService), variableType),
      text(data['value']),
      { allowEmpty: true },
    ),
  ];
};

const describeArrOpInput: TFieldDescriber = (node, ctx) => {
  const data = dataOf(node);
  const scopeCode = buildNodeScopeCode(node, ctx.projectService);
  const arr = text(data['arr']);
  return [
    customField('arr', arrayFieldPrefix(scopeCode), arr),
    // Always a TS expression, even when the editor shows it as text for string arrays.
    customField('value', arrayElementValuePrefix(scopeCode, arr), text(data['value'])),
  ];
};

const describeArrOpReturning: TFieldDescriber = (node, ctx) => {
  const data = dataOf(node);
  return [
    customField('arr', arrayFieldPrefix(buildNodeScopeCode(node, ctx.projectService)), text(data['arr'])),
    identifierField(node, ctx, 'variable', text(data['variable'])),
  ];
};

const describeArrInsert: TFieldDescriber = (node, ctx) => {
  const data = dataOf(node);
  const scopeCode = buildNodeScopeCode(node, ctx.projectService);
  const arr = text(data['arr']);
  return [
    scopeField(node, ctx, 'arr', arr),
    scopeField(node, ctx, 'start', text(data['start'])),
    customField('insertArr', arrayOfSameTypePrefix(scopeCode, arr), text(data['insertArr'])),
  ];
};

const describeArrSlice: TFieldDescriber = (node, ctx) => {
  const data = dataOf(node);
  return [
    scopeField(node, ctx, 'arr', text(data['arr'])),
    identifierField(node, ctx, 'variable', text(data['variable'])),
    scopeField(node, ctx, 'start', text(data['start'])),
    scopeField(node, ctx, 'end', text(data['end'])),
  ];
};

const describeForeach: TFieldDescriber = (node, ctx) => [scopeField(node, ctx, 'arr', text(dataOf(node)['arr']))];

const describeFromToCycle: TFieldDescriber = (node, ctx) => {
  const data = dataOf(node);
  return [scopeField(node, ctx, 'from', text(data['from'])), scopeField(node, ctx, 'to', text(data['to']))];
};

interface ITypedParameter {
  name: string;
  type: TVariableInfo;
}

/** Parameters typed by the target's signature — the editor's `DynamicTypedFieldsStore` fields, matched positionally. */
const describeParameters = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  parameters: readonly ITypedParameter[],
): ICheckedField[] => {
  const values = Array.isArray(dataOf(node)['parameters']) ? (dataOf(node)['parameters'] as unknown[]) : [];
  return parameters.map((parameter, index) =>
    typedField(node, ctx, `parameters.${parameter.name}`, text(values[index]), parameter.type),
  );
};

const describeCallFunction: TFieldDescriber = (node, ctx) => {
  const target = ctx.projectService?.functionsRegistry.functions.get(text(dataOf(node)['schemeId']));
  return describeParameters(node, ctx, target?.parameters ?? []);
};

const describeCallApi: TFieldDescriber = (node, ctx) => {
  const target = ctx.projectService?.externalApiRegistry.endpoints.get(text(dataOf(node)['iconId']));
  return describeParameters(node, ctx, target?.parameters ?? []);
};

const BUILTIN_DESCRIBERS: Readonly<Record<string, TFieldDescriber>> = {
  action: describeAction,
  while: describeExpression,
  switch: describeExpression,
  'switch-option': describeExpression,
  throw: describeExpression,
  if: describeIf,
  return: describeReturn,
  log: describeLog,
  'create-var': describeCreateVar,
  'arr-push': describeArrOpInput,
  'arr-unshift': describeArrOpInput,
  'arr-pop': describeArrOpReturning,
  'arr-shift': describeArrOpReturning,
  'arr-insert': describeArrInsert,
  'arr-slice': describeArrSlice,
  foreach: describeForeach,
  'from-to-cycle': describeFromToCycle,
  'call-function': describeCallFunction,
  'call-api': describeCallApi,
};

let registered = false;

/** Registers the describers of every TypeScript-domain block. Idempotent; called by `describeCheckedFields`. */
export const registerBuiltinFieldDescribers = (): void => {
  if (registered) return;
  registered = true;
  for (const [name, describer] of Object.entries(BUILTIN_DESCRIBERS)) registerFieldDescriber(name, describer);
};
