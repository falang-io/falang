import { COMMENT_NAME, type INode } from '@falang/dto';
import { defaultValueExpression, variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import { ACTIVEPIECES_ACTION_NAME, type TActivepiecesActionData } from '@falang/workflow-dto';
import { escapeTemplateLiteralBody } from './escape-template-literal.js';
import type { TResolveFunctionName } from './resolve-function-name.js';
import { asExpression, asStatement } from './raw-code.js';

interface ICreateVarData {
  readonly name: string;
  readonly variableType: TVariableInfo;
  readonly value?: string;
}

const emitCreateVar = (node: INode): string => {
  const data = node.data as ICreateVarData;
  const declaration = `let ${data.name}: ${variableInfoToTsType(data.variableType)}`;
  const initialValue = data.value?.trim() ? data.value : defaultValueExpression(data.variableType);
  return initialValue ? `${declaration} = ${initialValue};` : `${declaration};`;
};

const emitAction = (node: INode): string => asStatement(node.data as string);

/** Calls the `logActivity` activity (proxied at module scope by `compileProject`) so the message lands in Temporal's own execution history, not just the Worker's stderr — see ADR 0001 (private)'s `log` row. */
const emitLog = (node: INode): string => `await logActivity(\`${escapeTemplateLiteralBody(node.data as string)}\`);`;

interface IArrPopOrShiftData {
  readonly arr: string;
  readonly variable: string;
}

const emitArrPop = (node: INode): string => {
  const data = node.data as IArrPopOrShiftData;
  return `const ${data.variable.trim()} = ${asExpression(data.arr)}.pop();`;
};

const emitArrShift = (node: INode): string => {
  const data = node.data as IArrPopOrShiftData;
  return `const ${data.variable.trim()} = ${asExpression(data.arr)}.shift();`;
};

interface IArrPushOrUnshiftData {
  readonly arr: string;
  readonly value: string;
}

const emitArrPush = (node: INode): string => {
  const data = node.data as IArrPushOrUnshiftData;
  return `${asExpression(data.arr)}.push(${asExpression(data.value)});`;
};

const emitArrUnshift = (node: INode): string => {
  const data = node.data as IArrPushOrUnshiftData;
  return `${asExpression(data.arr)}.unshift(${asExpression(data.value)});`;
};

interface IArrInsertData {
  readonly arr: string;
  readonly start: string;
  readonly insertArr: string;
}

const emitArrInsert = (node: INode): string => {
  const data = node.data as IArrInsertData;
  return `${asExpression(data.arr)}.splice(${asExpression(data.start)}, 0, ...${asExpression(data.insertArr)});`;
};

interface IArrSliceData {
  readonly arr: string;
  readonly variable: string;
  readonly start: string;
  readonly end: string;
}

const emitArrSlice = (node: INode): string => {
  const data = node.data as IArrSliceData;
  const start = asExpression(data.start);
  const end = asExpression(data.end);
  return `const ${data.variable.trim()} = ${asExpression(data.arr)}.slice(${start}, ${end});`;
};

interface ICallFunctionData {
  readonly schemeId: string;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

export const emitCallFunction = (node: INode, resolveFunctionName: TResolveFunctionName): string => {
  const data = node.data as ICallFunctionData;
  const functionName = resolveFunctionName(data.schemeId);
  const args = data.parameters.map((param) => asExpression(param)).join(', ');
  const call = `await ${functionName}(${args})`;
  const variable = data.returnVariable.trim();
  return variable === '' ? `${call};` : `const ${variable} = ${call};`;
};

const emitThrow = (node: INode): string => `throw ${asExpression(node.data as string)};`;

/** A comment node (`@falang/dto`'s `commentCfg`): each line becomes a `//` comment — safe for any text, unlike `/* … *\/`. */
export const emitComment = (node: INode): string => {
  const text = (typeof node.data === 'string' ? node.data : '').trim();
  if (text === '') return '';
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() === '' ? '//' : `// ${line.trimEnd()}`))
    .join('\n');
};

const emitReturn = (node: INode): string => `return ${asExpression(node.data as string)};`;

/**
 * The single generic `activepieces-action` node kind — unlike every vendor's action nodes (dispatched
 * via `integrationEmitters`, built dynamically from `IWorkflowIntegration[]`), this bypasses that
 * mechanism entirely: there's no `IActionDescriptor` for it, since its field list (`propsValue`)
 * varies per node *instance*, not per node *kind* — see `@falang/workflow-dto`'s
 * `activepieces-action-nodes.ts` and ADR 0010 (private). Every
 * `propsValue` entry is raw expression code, same convention as any other `'expression'`-kind field.
 * Calls the one shared `runActivepiecesAction` activity (see `compile-activities.ts`).
 */
const emitActivepiecesAction = (node: INode): string => {
  const data = node.data as TActivepiecesActionData;
  const propsEntries = Object.entries(data.propsValue)
    .map(([key, value]) => `${JSON.stringify(key)}: ${asExpression(value)}`)
    .join(', ');
  const call = `runActivepiecesAction(${JSON.stringify(data.credentialId)}, ${JSON.stringify(data.pieceName)}, ${JSON.stringify(data.actionName)}, { ${propsEntries} })`;
  return `await ${call};`;
};

/** Node kinds that never need to recurse back into `compileStatements`. */
export const LEAF_EMITTERS: Record<string, (node: INode) => string> = {
  'create-var': emitCreateVar,
  action: emitAction,
  log: emitLog,
  'arr-pop': emitArrPop,
  'arr-shift': emitArrShift,
  'arr-push': emitArrPush,
  'arr-unshift': emitArrUnshift,
  'arr-insert': emitArrInsert,
  'arr-slice': emitArrSlice,
  throw: emitThrow,
  return: emitReturn,
  [COMMENT_NAME]: emitComment,
  [ACTIVEPIECES_ACTION_NAME]: emitActivepiecesAction,
};
