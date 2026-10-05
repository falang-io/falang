// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { UnsupportedNodeError, type IParser, type IProjector, type IStatementExtension } from '@falang/code-projection';
import type { INode } from '@falang/dto';
import {
  TIMEOUT_OPTION_LABEL,
  type IActionDescriptor,
  type IFieldConfig,
  type IQuestionDescriptor,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { actionMethodName, questionMethodName, vendorNamespace } from './naming.js';
import type { WorkflowModel } from './workflow-model.js';

/** The ambient constant a question's automatic timeout branch is written as: `case TIMEOUT:`. */
export const TIMEOUT_CONSTANT = 'TIMEOUT';

/** The fallback receiver for a node whose instance is not set / no longer exists: `telegramInstance("<id>")`. */
export const instanceFactoryName = (vendor: string): string => `${vendorNamespace(vendor)}Instance`;

type TDescriptor =
  | { readonly kind: 'action'; readonly integration: IWorkflowIntegration; readonly descriptor: IActionDescriptor }
  | { readonly kind: 'question'; readonly integration: IWorkflowIntegration; readonly descriptor: IQuestionDescriptor };

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Fields that are not call arguments: the instance (receiver), the declared variable, the result type. */
const isArgumentField = (field: IFieldConfig, credentialField: IFieldConfig | undefined): boolean =>
  field !== credentialField && field.kind !== 'new-variable' && field.kind !== 'result-type';

export const actionFields = (descriptor: TDescriptor): readonly IFieldConfig[] =>
  descriptor.kind === 'action'
    ? descriptor.descriptor.fields
    : [...descriptor.descriptor.contextFields, ...descriptor.descriptor.questionFields];

/**
 * Vendor actions and questions as method calls on an integration instance:
 * `const reply = await gpt.callAiText<string>({ model: "gpt-4o", prompt: \`…\` })`,
 * `switch (await supportBot.askQuestion({ chatId, question: \`…\` })) { case 'Yes': { … } }`.
 * The credential-ref field is the receiver, a `new-variable` field the declared constant, a `result-type` field the
 * type argument; every other field is a property, typed by its kind (see `declarations.ts`).
 */
export class IntegrationExtension implements IStatementExtension {
  private readonly model: WorkflowModel;
  private readonly byNodeName = new Map<string, TDescriptor>();
  private readonly byMethod = new Map<string, Map<string, TDescriptor>>();

  constructor(model: WorkflowModel) {
    this.model = model;
    for (const integration of model.input.integrations) {
      const methods = new Map<string, TDescriptor>();
      for (const descriptor of integration.actions) {
        const entry: TDescriptor = { descriptor, integration, kind: 'action' };
        this.byNodeName.set(descriptor.name, entry);
        methods.set(actionMethodName(descriptor.name, integration.vendor), entry);
      }
      for (const descriptor of integration.questions ?? []) {
        const entry: TDescriptor = { descriptor, integration, kind: 'question' };
        this.byNodeName.set(descriptor.name, entry);
        methods.set(questionMethodName(descriptor.name, integration.vendor), entry);
      }
      this.byMethod.set(integration.vendor, methods);
    }
  }

  handles(nodeName: string): boolean {
    return this.byNodeName.has(nodeName);
  }

  // ---- projection ------------------------------------------------------------------------------------------------

  private receiver(vendor: string, instanceId: string): string {
    const instance = this.model.instanceById(instanceId);
    return instance && instance.integration.vendor === vendor
      ? instance.identifier
      : `${instanceFactoryName(vendor)}(${JSON.stringify(instanceId)})`;
  }

  private property(field: IFieldConfig, value: string, projector: IProjector): string | null {
    if (value.trim() === '') return null;
    if (field.kind === 'expression') return `${field.name}: ${value.trim()}`;
    if (field.kind === 'template-string') return `${field.name}: ${projector.template(value)}`;
    return `${field.name}: ${JSON.stringify(value)}`;
  }

  private call(node: INode, entry: TDescriptor, projector: IProjector): string {
    const data = (node.data ?? {}) as Readonly<Record<string, unknown>>;
    const fields = actionFields(entry);
    const credentialField = fields.find((field) => field.kind === 'credential-ref');
    const method =
      entry.kind === 'action'
        ? actionMethodName(entry.descriptor.name, entry.integration.vendor)
        : questionMethodName(entry.descriptor.name, entry.integration.vendor);
    const resultField = fields.find((field) => field.kind === 'result-type');
    const resultType = resultField ? str(data[resultField.name]).trim() : '';
    let typeArgument = '';
    if (resultType !== '') {
      try {
        typeArgument = `<${projector.type(JSON.parse(resultType))}>`;
      } catch {
        throw new UnsupportedNodeError(node, `"${node.name}" has an unreadable result type: ${resultType}`);
      }
    }
    const properties = fields
      .filter((field) => isArgumentField(field, credentialField))
      .map((field) => this.property(field, str(data[field.name]), projector))
      .filter((prop): prop is string => prop !== null);
    const oneLine = `{ ${properties.join(', ')} }`;
    const argument =
      properties.length === 0
        ? ''
        : oneLine.length <= 80 && !oneLine.includes('\n')
          ? oneLine
          : `{\n${properties.map((prop) => `  ${prop.replaceAll('\n', '\n  ')},`).join('\n')}\n}`;
    const receiver = this.receiver(entry.integration.vendor, credentialField ? str(data[credentialField.name]) : '');
    return `await ${receiver}.${method}${typeArgument}(${argument})`;
  }

  project(node: INode, projector: IProjector): string {
    const entry = this.byNodeName.get(node.name);
    if (!entry) throw new UnsupportedNodeError(node);
    if (entry.kind === 'action') {
      const variableField = entry.descriptor.fields.find((field) => field.kind === 'new-variable');
      const variable = variableField
        ? str((node.data as Record<string, unknown> | undefined)?.[variableField.name]).trim()
        : '';
      const call = this.call(node, entry, projector);
      return variable === '' ? `${call};` : `const ${variable} = ${call};`;
    }
    if (entry.descriptor.optionDataTypes || entry.descriptor.answerScope) {
      throw new UnsupportedNodeError(node, `"${node.name}" options with typed data are not projected yet`);
    }
    const cases = (node.children ?? []).map((option) => {
      const optionData = (option.data ?? {}) as { label?: string; fixed?: boolean };
      return projector.caseClause(optionData.fixed ? TIMEOUT_CONSTANT : JSON.stringify(str(optionData.label)), option);
    });
    const body = cases.join('\n');
    return `switch (${this.call(node, entry, projector)}) {\n${body
      .split('\n')
      .map((line) => (line === '' ? line : `  ${line}`))
      .join('\n')}${body === '' ? '' : '\n'}}`;
  }

  // ---- parsing ---------------------------------------------------------------------------------------------------

  /** `await <receiver>.<method><T>({…})` → the descriptor, instance id and call node, or null if it isn't one. */
  private readCall(
    expression: ts.Expression,
    parser: IParser,
  ): { entry: TDescriptor; instanceId: string; call: ts.CallExpression } | null {
    if (!ts.isAwaitExpression(expression)) return null;
    const call = expression.expression;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return null;
    const target = call.expression.expression;
    let vendor: string | undefined;
    let instanceId: string | undefined;
    if (ts.isIdentifier(target)) {
      const instance = this.model.instanceByIdentifier(target.text);
      if (!instance) return null;
      vendor = instance.integration.vendor;
      instanceId = instance.instance.id;
    } else if (ts.isCallExpression(target) && ts.isIdentifier(target.expression)) {
      const factory = target.expression.text;
      const integration = this.model.input.integrations.find(
        (candidate) => instanceFactoryName(candidate.vendor) === factory,
      );
      const arg = target.arguments[0];
      if (!integration || !arg || !ts.isStringLiteralLike(arg)) return null;
      vendor = integration.vendor;
      instanceId = arg.text;
    } else {
      return null;
    }
    const methods = this.byMethod.get(vendor);
    const method = call.expression.name.text;
    const entry = methods?.get(method);
    if (!entry) {
      parser.fail(
        call.expression.name,
        `\`${method}\` is not a method of a ${vendor} instance. Available: ${[...(methods?.keys() ?? [])].join(', ')} (see vendors.d.ts).`,
      );
    }
    return { call, entry, instanceId };
  }

  private readFields(
    entry: TDescriptor,
    instanceId: string,
    call: ts.CallExpression,
    parser: IParser,
  ): Record<string, string> {
    const fields = actionFields(entry);
    const credentialField = fields.find((field) => field.kind === 'credential-ref');
    const values: Record<string, string> = Object.fromEntries(fields.map((field) => [field.name, '']));
    if (credentialField) values[credentialField.name] = instanceId;
    const resultField = fields.find((field) => field.kind === 'result-type');
    const typeArgument = call.typeArguments?.[0];
    if (resultField && typeArgument) values[resultField.name] = JSON.stringify(parser.typeOf(typeArgument));
    else if (typeArgument) parser.fail(typeArgument, 'This call takes no type argument.');
    const [argument, extra] = call.arguments;
    if (extra) parser.fail(extra, 'Pass all parameters in one object: `({ name: value, … })`.');
    if (!argument) return values;
    if (!ts.isObjectLiteralExpression(argument))
      parser.fail(argument, 'Pass the parameters as an object literal: `({ name: value, … })`.');
    const argumentFields = fields.filter((field) => isArgumentField(field, credentialField));
    for (const property of argument.properties) {
      const name =
        (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? property.name.text
          : undefined;
      const field = argumentFields.find((candidate) => candidate.name === name);
      if (!name || !field) {
        parser.fail(
          property,
          `Unknown parameter${name ? ` \`${name}\`` : ''}. Parameters: ${argumentFields.map((f) => f.name).join(', ')}.`,
        );
      }
      const value = ts.isShorthandPropertyAssignment(property)
        ? property.name
        : (property as ts.PropertyAssignment).initializer;
      if (field.kind === 'expression') values[field.name] = parser.text(value);
      else if (field.kind === 'template-string') values[field.name] = parser.templateBody(value);
      else if (ts.isStringLiteralLike(value)) values[field.name] = value.text;
      else
        parser.fail(
          value,
          `\`${field.name}\` must be a string literal, e.g. \`${field.name}: "…"\` (it is a fixed setting, not code).`,
        );
    }
    return values;
  }

  parse(statement: ts.Statement, parser: IParser): INode | null {
    if (ts.isSwitchStatement(statement)) return this.parseQuestion(statement, parser);
    let expression: ts.Expression | undefined;
    let variable = '';
    if (ts.isExpressionStatement(statement)) {
      expression = statement.expression;
    } else if (ts.isVariableStatement(statement)) {
      const [declaration, extra] = statement.declarationList.declarations;
      if (!declaration || extra || declaration.type || !declaration.initializer || !ts.isIdentifier(declaration.name))
        return null;
      expression = declaration.initializer;
      variable = declaration.name.text;
    }
    if (!expression) return null;
    const read = this.readCall(expression, parser);
    if (!read) return null;
    if (read.entry.kind !== 'action') {
      parser.fail(
        statement,
        `\`${read.call.expression.getText()}\` asks a question: use it as \`switch (await …) { case '…': { … } }\`.`,
      );
    }
    const values = this.readFields(read.entry, read.instanceId, read.call, parser);
    const variableField = read.entry.descriptor.fields.find((field) => field.kind === 'new-variable');
    if (variable !== '') {
      if (!variableField)
        parser.fail(
          statement,
          `\`${read.call.expression.getText()}\` returns nothing: call it without \`const ${variable} =\`.`,
        );
      values[variableField.name] = variable;
    }
    return { data: values, id: parser.newId(), name: read.entry.descriptor.name };
  }

  private parseQuestion(statement: ts.SwitchStatement, parser: IParser): INode | null {
    const read = this.readCall(statement.expression, parser);
    if (!read) return null;
    if (read.entry.kind !== 'question') {
      parser.fail(statement.expression, 'Only questions (`ask…` methods) can be switched on.');
    }
    const descriptor = read.entry.descriptor;
    if (descriptor.optionDataTypes || descriptor.answerScope) {
      parser.fail(statement, `\`${descriptor.name}\` options with typed data are not supported in code yet.`);
    }
    const values = this.readFields(read.entry, read.instanceId, read.call, parser);
    const options = parser.cases(statement.caseBlock).map(({ test, nodes, clause }) => {
      let data: { label: string; fixed?: true };
      if (!test) {
        parser.fail(clause, 'A question has no `default:` branch: one `case` per button label.');
      } else if (ts.isIdentifier(test) && test.text === TIMEOUT_CONSTANT) {
        if (!descriptor.timeoutField) parser.fail(test, `\`${descriptor.name}\` has no timeout.`);
        data = { fixed: true, label: TIMEOUT_OPTION_LABEL };
      } else if (ts.isStringLiteralLike(test)) {
        data = { label: test.text };
      } else {
        parser.fail(
          test,
          `A case must be a button label in quotes (\`case 'Yes':\`)${descriptor.timeoutField ? ` or \`case ${TIMEOUT_CONSTANT}:\`` : ''}.`,
        );
      }
      return { children: nodes, data, id: parser.newId(), name: `${descriptor.name}-option` };
    });
    return {
      children: options,
      data: { ...values, options: options.filter((option) => !option.data.fixed).map((option) => option.data.label) },
      id: parser.newId(),
      name: descriptor.name,
    };
  }
}
