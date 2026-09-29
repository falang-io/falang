import type { INode } from '@falang/dto';
import { variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import type { IChoiceDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { indentLines } from './indent.js';
import { resolveFieldExpression } from './integration-emitters.js';
import type { TQuestionEmitters } from './node-emitters.js';
import { buildSwitchCases, type TCompileChildren } from './switch-cases.js';

interface IChoiceOptionData {
  readonly alias: string;
  readonly dataType: TVariableInfo;
  readonly variable: string;
}

/** `IChoiceDescriptor.activitySignature` is `'<name>(...): Promise<...>'` — the bare name is everything before the first `(`. */
const parseActivityName = (signature: string): string => signature.slice(0, signature.indexOf('(')).trim();

/** `c_<sanitized node id>` — same rationale as `question-emitters.ts`'s `variablePrefix`. */
const variablePrefix = (node: INode): string => `c_${node.id.replaceAll('-', '_')}`;

interface IJsonSchemaScalarType {
  readonly type: 'string' | 'number' | 'boolean';
}

/**
 * Deliberately scalar-only (unlike `variableInfoToTsType`, which handles the full `TVariableInfo`
 * union) — `struct`/`array`/`union`/`enum`/`any`/`void`/`never` would need the compiler to resolve
 * project struct definitions into JSON Schema, a capability that doesn't exist anywhere yet (the
 * same gap `call-ai-text`'s `result`-type field already hits, see `openai.integration.ts`). Throws
 * rather than silently emitting a schema that doesn't match the option's declared type.
 */
const variableInfoToJsonSchemaType = (type: TVariableInfo, nodeId: string): IJsonSchemaScalarType => {
  if (type.type === 'string' || type.type === 'number' || type.type === 'boolean') return { type: type.type };
  throw new Error(
    `Choice node "${nodeId}": option data type "${type.type}" isn't supported yet — only string/number/boolean are (structured/struct output needs the compiler to resolve project struct definitions into JSON Schema, which doesn't exist yet).`,
  );
};

/** One `anyOf` branch per option: `{ action: <alias>, data: <scalar JSON Schema type> }`, both required, no extra properties. */
const buildOptionSchema = (option: INode): object => {
  const { alias, dataType } = option.data as IChoiceOptionData;
  return {
    type: 'object',
    properties: { action: { type: 'string', enum: [alias] }, data: variableInfoToJsonSchemaType(dataType, option.id) },
    required: ['action', 'data'],
    additionalProperties: false,
  };
};

/**
 * Builds the codegen for one `IChoiceDescriptor`: a single synchronous call passing a JSON Schema
 * built from this node's options (an inline object literal — `JSON.stringify` output is valid JS
 * object-literal syntax, so no runtime `JSON.parse` is needed), then branches on the returned
 * `action` like an ordinary `switch`, binding `data` (cast to the branch's declared type) at the top
 * of each case — see `@falang/typescript-common`'s `CONTAINER_SCOPE_CONTRIBUTORS` for how the editor
 * knows `data`'s type inside each branch for autocomplete/type-checking.
 */
const buildChoiceEmitter = (descriptor: IChoiceDescriptor): ((node: INode, compile: TCompileChildren) => string) => {
  const fnName = parseActivityName(descriptor.activitySignature);
  const fieldsByName = new Map(
    [...descriptor.contextFields, ...descriptor.promptFields].map((field) => [field.name, field]),
  );

  return (node, compile) => {
    const data = (node.data ?? {}) as Readonly<Record<string, string>>;
    const resolveField = (name: string): string => {
      const field = fieldsByName.get(name);
      if (!field) throw new Error(`Choice node "${node.id}" has no declared field "${name}"`);
      const resolved = resolveFieldExpression(field, data[name] ?? '');
      // Unlike `IActionDescriptor.emit`, a choice has no per-field hook to substitute a default for a
      // blank field (`call-ai-text`'s own action `emit`, by contrast, does `fields.attachments ||
      // '[]'` itself) — this generic arg-joining is all there is. A blank `'expression'` field
      // (`data[name]` absent — e.g. a field added to a vendor's choice after documents already
      // existed, like `call-ai-choice`'s own `attachments`, or a node built by a fixture/older client
      // that predates the field) would otherwise resolve to `''` and land as a genuinely empty
      // argument between two commas — a syntax error, not a type error, surfacing as an opaque
      // "Project failed to compile". `'undefined'` is always syntactically valid here; the activity's
      // own signature/body is responsible for accepting `| undefined` and defaulting it (see
      // `callAiChoice`'s `attachments` in `openai.integration.ts`) — same convention `sql-common`'s
      // hand-written `fields.where || 'undefined'` already uses for its own blank expression fields.
      return resolved || (field.kind === 'expression' ? 'undefined' : resolved);
    };
    const contextArgs = descriptor.contextFields.map((field) => resolveField(field.name));
    const promptArgs = descriptor.promptFields.map((field) => resolveField(field.name));
    const options = node.children ?? [];
    const schema = { anyOf: options.map((option) => buildOptionSchema(option)) };
    const prefix = variablePrefix(node);

    const cases = buildSwitchCases(
      options,
      compile,
      (option) => JSON.stringify((option.data as IChoiceOptionData).alias),
      (option) => {
        const { dataType, variable } = option.data as IChoiceOptionData;
        return `const ${variable} = ${prefix}Result.data as ${variableInfoToTsType(dataType)};`;
      },
    );

    const args = [...contextArgs, ...promptArgs, JSON.stringify(schema)].join(', ');
    // `${prefix}Result.action` is typed as plain `string` (the activity's return type doesn't
    // narrow it to a literal union of the declared aliases — see `IChoiceDescriptor`), so TypeScript
    // can't prove the switch above is exhaustive. Without this, a `call-ai-choice` node used as a
    // function's last statement fails to compile ("Function lacks ending return statement") the
    // moment the function's return type isn't `void`/`undefined` — every option branch does return,
    // but the switch itself doesn't visibly exhaust every `string` value. The JSON Schema's `anyOf`
    // + `enum` already constrains the real activity to only ever return a declared alias, so this
    // only ever fires if that contract is broken at runtime.
    const defaultCase = `default: {\n${indentLines(`throw new Error(\`Unexpected choice action: \${${prefix}Result.action}\`);`)}\n}`;
    return [
      `const ${prefix}Result = await ${fnName}(${args});`,
      `switch (${prefix}Result.action) {\n${indentLines(`${cases}\n${defaultCase}`)}\n}`,
    ].join('\n');
  };
};

/** One recursive emitter per registered vendor's choice node kind — see `IChoiceDescriptor`. */
export const buildChoiceEmitters = (integrations: readonly IWorkflowIntegration[]): TQuestionEmitters => {
  const emitters: TQuestionEmitters = {};
  for (const integration of integrations) {
    for (const choice of integration.choices ?? []) {
      emitters[choice.name] = buildChoiceEmitter(choice);
    }
  }
  return emitters;
};
