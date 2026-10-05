// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { renderType, TYPE_LIB_DECLARATIONS } from '@falang/code-projection';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IFieldConfig, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { actionFields, instanceFactoryName, TIMEOUT_CONSTANT } from './integration-extension.js';
import { actionMethodName, questionMethodName, triggerMethodName, vendorNamespace } from './naming.js';
import type { WorkflowModel } from './workflow-model.js';

export const FALANG_DECLARATIONS = `// Built-ins available in every function and trigger file (read-only).
${TYPE_LIB_DECLARATIONS}
/** A duration: a number followed by ms, s, m, h or d — e.g. "30s", "10m", "48h". */
type Duration = \`\${number}\${'ms' | 's' | 'm' | 'h' | 'd'}\`;
/** Writes a line to the run's log. Pass a template literal: log(\`count = \${count}\`). */
declare function log(message: string): void;
/** The automatic branch of a question nobody answered in time: \`case ${TIMEOUT_CONSTANT}:\`. */
declare const ${TIMEOUT_CONSTANT}: '__timeout__';
/** What a trigger registration returns (\`export default bot.onMessage(async (message) => { … })\`). */
interface Trigger {
  readonly __trigger: true;
}
`;

const propertyLines = (properties: Readonly<Record<string, TVariableInfo>>, model: WorkflowModel): string[] =>
  Object.entries(properties).map(([name, type]) =>
    type.optional
      ? `${name}?: ${renderType({ ...type, optional: false }, model.types)};`
      : `${name}: ${renderType(type, model.types)};`,
  );

const literalUnion = (values: readonly string[]): string => values.map((value) => JSON.stringify(value)).join(' | ');

const fieldType = (field: IFieldConfig, model: WorkflowModel, timeoutField: string | undefined): string => {
  if (field.name === timeoutField) return 'Duration';
  if (field.kind === 'expression') {
    return typeof field.expectedType === 'object' ? renderType(field.expectedType, model.types) : 'any';
  }
  if (field.kind === 'select' && field.options && field.options.length > 0) {
    return literalUnion(field.options.map((option) => option.value));
  }
  return 'string';
};

const isRequired = (field: IFieldConfig, timeoutField: string | undefined): boolean =>
  field.name !== timeoutField &&
  (field.kind === 'expression' || field.kind === 'template-string') &&
  field.defaultValue === undefined;

const paramsType = (fields: readonly IFieldConfig[], model: WorkflowModel, timeoutField?: string): string => {
  const credential = fields.find((field) => field.kind === 'credential-ref');
  const lines = fields
    .filter((field) => field !== credential && field.kind !== 'new-variable' && field.kind !== 'result-type')
    .map(
      (field) => `${field.name}${isRequired(field, timeoutField) ? '' : '?'}: ${fieldType(field, model, timeoutField)}`,
    );
  return lines.length === 0 ? '' : `params: { ${lines.join('; ')} }`;
};

const vendorBlock = (integration: IWorkflowIntegration, model: WorkflowModel, withInstance: boolean): string => {
  const ns = vendorNamespace(integration.vendor);
  const lines: string[] = [];
  for (const type of integration.types ?? []) {
    lines.push(`interface ${type.name} {`, ...propertyLines(type.properties, model).map((line) => `  ${line}`), '}');
  }
  if (withInstance) {
    lines.push('interface Instance {');
    for (const action of integration.actions) {
      const entry = { descriptor: action, integration, kind: 'action' as const };
      const fields = actionFields(entry);
      const hasResultTypeField = fields.some((field) => field.kind === 'result-type');
      const hasVariable = fields.some((field) => field.kind === 'new-variable');
      let result = 'void';
      if (hasResultTypeField) result = 'T';
      else if (typeof action.resultType === 'object') result = renderType(action.resultType, model.types);
      else if (hasVariable) result = 'any';
      const generic = hasResultTypeField ? '<T = string>' : '';
      lines.push(
        `  ${actionMethodName(action.name, integration.vendor)}${generic}(${paramsType(fields, model)}): Promise<${result}>;`,
      );
    }
    for (const question of integration.questions ?? []) {
      const fields = [...question.contextFields, ...question.questionFields];
      const result = question.timeoutField ? `string | typeof ${TIMEOUT_CONSTANT}` : 'string';
      lines.push(`  /** Asks with buttons; use as \`switch (await …) { case 'Label': { … } }\`. */`);
      lines.push(
        `  ${questionMethodName(question.name, integration.vendor)}(${paramsType(fields, model, question.timeoutField)}): Promise<${result}>;`,
      );
    }
    for (const choice of integration.choices ?? []) {
      const fields = [...choice.contextFields, ...choice.promptFields];
      lines.push(
        '  /** AI picks one of the options you list as cases: `const choice = await …; switch (choice.action) { case "name": { const data = choice.data as string; … } }`. */',
      );
      lines.push(
        `  ${actionMethodName(choice.name, integration.vendor)}(${paramsType(fields, model)}): Promise<{ action: string; data: unknown }>;`,
      );
    }
    for (const trigger of integration.triggers) {
      const payload = `(${trigger.scopeVariableName}: ${renderType(trigger.scopeType, model.types)}) => Promise<unknown>`;
      const config =
        trigger.contextFields && trigger.contextFields.length > 0
          ? `config: { ${trigger.contextFields.map((field) => `${field.name}: string`).join('; ')} }, `
          : '';
      lines.push(`  /** ${trigger.notes.replaceAll('*/', '* /').replaceAll('\n', ' ')} */`);
      lines.push(`  ${triggerMethodName(trigger.name, integration.vendor)}(${config}handler: ${payload}): Trigger;`);
    }
    lines.push('}');
  }
  const block = [`declare namespace ${ns} {`, ...lines.map((line) => `  ${line}`), '}'];
  if (withInstance)
    block.push(
      `/** An instance by id, for a node whose instance is missing from integrations.ts. */`,
      `declare function ${instanceFactoryName(integration.vendor)}(id: string): ${ns}.Instance;`,
    );
  return block.join('\n');
};

const structIdsIn = (type: TVariableInfo, into: Set<string>): void => {
  if (type.type === 'struct') into.add(type.id);
  if (type.type === 'array') structIdsIn(type.elementType, into);
  if (type.type === 'union') for (const member of type.unionTypes) structIdsIn(member, into);
};

const collectNodeNames = (node: INode | null | undefined, into: Set<string>): void => {
  if (!node) return;
  into.add(node.name);
  for (const child of node.children ?? []) collectNodeNames(child, into);
  if (node.out) collectNodeNames(node.out, into);
};

/** Vendors the project uses: instances, trigger documents, node kinds — plus the vendors their types refer to. */
export const usedVendors = (model: WorkflowModel): { withInstance: Set<string>; typesOnly: Set<string> } => {
  const withInstance = new Set(model.instances.map((entry) => entry.integration.vendor));
  const names = new Set<string>();
  for (const doc of model.input.documents) {
    collectNodeNames(doc.root, names);
    const body = doc.root?.children?.[1];
    const vendor = (body?.data as { vendor?: unknown } | undefined)?.vendor;
    if (doc.type === 'trigger-function' && typeof vendor === 'string' && vendor !== '') withInstance.add(vendor);
  }
  for (const integration of model.input.integrations) {
    const kinds = [...integration.actions, ...(integration.questions ?? []), ...(integration.choices ?? [])].map(
      (descriptor) => descriptor.name,
    );
    if (kinds.some((kind) => names.has(kind))) withInstance.add(integration.vendor);
  }
  const ownerOf = new Map<string, string>();
  for (const integration of model.input.integrations)
    for (const type of integration.types ?? []) ownerOf.set(type.id, integration.vendor);
  const typesOnly = new Set<string>();
  const pending = [...withInstance];
  while (pending.length > 0) {
    const vendor = pending.pop() as string;
    const integration = model.integrationsByVendor.get(vendor);
    const ids = new Set<string>();
    for (const type of integration?.types ?? [])
      for (const property of Object.values(type.properties)) structIdsIn(property, ids);
    for (const trigger of integration?.triggers ?? []) structIdsIn(trigger.scopeType, ids);
    for (const id of ids) {
      const owner = ownerOf.get(id);
      if (owner && !withInstance.has(owner) && !typesOnly.has(owner)) {
        typesOnly.add(owner);
        pending.push(owner);
      }
    }
  }
  return { typesOnly, withInstance };
};

export const vendorsDeclarations = (model: WorkflowModel): string => {
  const { withInstance, typesOnly } = usedVendors(model);
  const blocks = model.input.integrations
    .filter((integration) => withInstance.has(integration.vendor) || typesOnly.has(integration.vendor))
    .map((integration) => vendorBlock(integration, model, withInstance.has(integration.vendor)));
  return `// Integrations used by this project: their types, and the methods of an instance (read-only, generated).\n${blocks.join('\n\n')}\n`;
};

export const integrationsDeclarations = (model: WorkflowModel): string => {
  const lines = model.instances.map(
    (entry) =>
      `declare const ${entry.identifier}: ${vendorNamespace(entry.integration.vendor)}.Instance; // "${entry.instance.name.replaceAll('\n', ' ')}"`,
  );
  return [
    '// Integration instances of this project. They are global: use them directly, no import needed.',
    '// Credentials are filled in by the user in the editor, never in code.',
    ...lines,
    '',
  ].join('\n');
};

/** `objects-structure` documents as interfaces. */
export const typesDeclarations = (model: WorkflowModel, excludeDocumentId?: string): string => {
  const blocks: string[] = [];
  for (const doc of model.input.documents) {
    if (doc.type !== 'objects-structure' || !doc.root || doc.id === excludeDocumentId) continue;
    for (const thread of doc.root.children?.[1]?.children ?? []) {
      const name = typeof thread.data === 'string' ? thread.data.trim() : '';
      if (name === '') continue;
      const properties: Record<string, TVariableInfo> = {};
      for (const child of thread.children ?? []) {
        const data = child.data as { name?: string; variableType?: TVariableInfo } | undefined;
        if (data?.name && data.variableType) properties[data.name] = data.variableType;
      }
      blocks.push(
        [`interface ${name} {`, ...propertyLines(properties, model).map((line) => `  ${line}`), '}'].join('\n'),
      );
    }
  }
  return `// Types declared in this project's objects-structure documents (read-only here).\n${blocks.join('\n\n')}\n`;
};
