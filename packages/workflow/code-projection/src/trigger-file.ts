// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import {
  foldOuts,
  jsDoc,
  parseReturnType,
  parseSourceOrFail,
  Parser,
  projectBody,
  Projector,
  readJsDoc,
  renderReturnType,
  singleTopLevelStatement,
  type IProjectionContext,
} from '@falang/code-projection';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { ITriggerDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { instanceFactoryName } from './integration-extension.js';
import { triggerMethodName } from './naming.js';
import type { WorkflowModel } from './workflow-model.js';

export interface ITriggerBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly scopeVariableName: string;
  readonly scopeType: TVariableInfo;
  readonly returnValue?: TVariableInfo;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

export const findTrigger = (
  integrations: readonly IWorkflowIntegration[],
  vendor: string,
  triggerName: string,
): ITriggerDescriptor | undefined =>
  integrations
    .find((integration) => integration.vendor === vendor)
    ?.triggers.find((trigger) => trigger.name === triggerName);

const receiverOf = (model: WorkflowModel, vendor: string, credentialId: string): string => {
  const instance = model.instanceById(credentialId);
  return instance && instance.integration.vendor === vendor
    ? instance.identifier
    : `${instanceFactoryName(vendor)}(${JSON.stringify(credentialId)})`;
};

/** A `trigger-function` document → `triggers/<name>.ts`. */
export const projectTriggerFile = (root: INode, model: WorkflowModel, ctx: IProjectionContext): string => {
  const [header, body, footer] = root.children ?? [];
  const data = (body?.data ?? {}) as ITriggerBodyData;
  const projector = new Projector(ctx);
  const descriptor = findTrigger(model.input.integrations, data.vendor, data.triggerName);
  const method = triggerMethodName(data.triggerName, data.vendor);
  const config = Object.entries(data.triggerConfig ?? {})
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');
  const hasConfig = (descriptor?.contextFields?.length ?? 0) > 0 || config !== '';
  const parameter = `${data.scopeVariableName || 'payload'}: ${projector.type(data.scopeType)}`;
  const content = projectBody(projector, body, footer);
  const handler = `async (${parameter}): ${renderReturnType(projector, data.returnValue)} => {\n${content}${content === '' ? '' : '\n'}}`;
  const args = [hasConfig ? `{ ${config} }` : null, handler].filter((arg) => arg !== null).join(', ');
  const doc = jsDoc(typeof header?.data === 'string' ? header.data : '');
  return `${doc === '' ? '' : `${doc}\n`}export default ${receiverOf(model, data.vendor, data.credentialId)}.${method}(${args});\n`;
};

/** `triggers/<name>.ts` → a fresh `trigger-function` root. */
export const parseTriggerFile = (
  text: string | ts.SourceFile,
  fileName: string,
  model: WorkflowModel,
  ctx: IProjectionContext,
): INode => {
  const source = parseSourceOrFail(fileName, text);
  const parser: Parser = new Parser(source, ctx, fileName);
  const expected = '`export default <instance>.<onEvent>(…, async (<payload>) => { … });`';
  const statement = singleTopLevelStatement(parser, source, expected);
  if (!ts.isExportAssignment(statement) || statement.isExportEquals) parser.fail(statement, `Expected ${expected}`);
  const call = statement.expression;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression))
    parser.fail(call, `Expected ${expected}`);
  const target = call.expression.expression;
  let vendor: string | undefined;
  let credentialId = '';
  if (ts.isIdentifier(target)) {
    const instance = model.instanceByIdentifier(target.text);
    if (!instance) parser.fail(target, `\`${target.text}\` is not an integration instance (see integrations.ts).`);
    vendor = instance.integration.vendor;
    credentialId = instance.instance.id;
  } else if (
    ts.isCallExpression(target) &&
    ts.isIdentifier(target.expression) &&
    target.arguments[0] &&
    ts.isStringLiteralLike(target.arguments[0])
  ) {
    const factory = target.expression.text;
    vendor = model.input.integrations.find(
      (integration) => instanceFactoryName(integration.vendor) === factory,
    )?.vendor;
    credentialId = target.arguments[0].text;
  }
  if (!vendor) parser.fail(target, 'The trigger must be called on an integration instance from integrations.ts.');
  const integration = model.integrationsByVendor.get(vendor);
  const method = call.expression.name.text;
  const descriptor = integration?.triggers.find((trigger) => triggerMethodName(trigger.name, vendor) === method);
  if (!integration || !descriptor) {
    const available = integration?.triggers.map((trigger) => triggerMethodName(trigger.name, vendor)).join(', ') ?? '';
    parser.fail(call.expression.name, `\`${method}\` is not a trigger of ${vendor}. Available: ${available}.`);
  }
  const args = [...call.arguments];
  const handler = args.pop();
  if (!handler || !ts.isArrowFunction(handler) || !ts.isBlock(handler.body)) {
    parser.fail(call, 'The last argument must be the handler: `async (payload) => { … }`.');
  }
  const [configArgument, extra] = args;
  if (extra) parser.fail(extra, 'A trigger takes at most a config object and the handler.');
  const triggerConfig: Record<string, string> = {};
  if (configArgument) {
    if (!ts.isObjectLiteralExpression(configArgument))
      parser.fail(configArgument, 'The trigger config must be an object literal.');
    for (const property of configArgument.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !ts.isIdentifier(property.name) ||
        !ts.isStringLiteralLike(property.initializer)
      ) {
        parser.fail(property, 'Trigger config values are string literals: `{ command: "/start" }`.');
      }
      if (!descriptor.contextFields?.some((field) => field.name === (property.name as ts.Identifier).text)) {
        parser.fail(
          property,
          `Unknown trigger setting. Settings: ${(descriptor.contextFields ?? []).map((field) => field.name).join(', ') || 'none'}.`,
        );
      }
      triggerConfig[property.name.text] = property.initializer.text;
    }
  }
  const [parameter, extraParameter] = handler.parameters;
  if (extraParameter) parser.fail(extraParameter, 'The handler takes one parameter: the trigger payload.');
  if (parameter && (!ts.isIdentifier(parameter.name) || parameter.name.text !== descriptor.scopeVariableName)) {
    parser.fail(parameter, `The payload parameter must be named \`${descriptor.scopeVariableName}\`.`);
  }
  const returnValue = parseReturnType(parser, handler.type);
  const list = parser.list(handler.body);
  const bodyData: ITriggerBodyData = {
    credentialId,
    ...(returnValue ? { returnValue } : {}),
    scopeType: descriptor.scopeType,
    scopeVariableName: descriptor.scopeVariableName,
    ...(Object.keys(triggerConfig).length > 0 ? { triggerConfig } : {}),
    triggerName: descriptor.name,
    vendor,
  };
  return foldOuts(
    {
      children: [
        { data: readJsDoc(source, statement), id: parser.newId(), name: 'function-header' },
        { children: list.nodes, data: bodyData, id: parser.newId(), name: 'trigger-function-body' },
        { data: list.footer ?? '', id: parser.newId(), name: 'function-footer' },
      ],
      id: parser.newId(),
      name: 'trigger-function',
    },
    ctx,
  );
};
