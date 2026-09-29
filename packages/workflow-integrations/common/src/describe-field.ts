import { variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import type { IFieldConfig } from './types.js';

const renderExpectedType = (type: TVariableInfo): string =>
  type.type === 'struct' ? `the struct type "${type.id}"` : `type \`${variableInfoToTsType(type)}\``;

/**
 * `@falang/workflow-integrations-files`'s struct id — hardcoded here (not imported) since `common`
 * has no dependency on that package (it's the other way around) and this is just a data string, the
 * same "known by id, not by a type import" relationship `IObjectTypeInfo.id` already has everywhere
 * else. Detected generically off `expectedType` (a bare struct, or an array of them) so any field —
 * this vendor's own or a future one's (Telegram media, OpenAI attachments) — gets the same note.
 */
const FILE_STRUCT_ID = 'files/File';

const isFileReferenceType = (type: TVariableInfo): boolean => {
  if (type.type === 'struct') return type.id === FILE_STRUCT_ID;
  if (type.type === 'array') return isFileReferenceType(type.elementType);
  return false;
};

/**
 * A real chat had the agent pass a `File`-typed field a URL string instead of a variable holding a
 * `File` — `File` is a reference (id/name/size/mime/publicUrl?), not fetchable text, and nothing
 * else in a field's description says so. See ADR 0038 (private)'s §8.
 */
const FILE_REFERENCE_NOTE =
  ' This is a File reference (struct files/File) — pass a variable holding a File, never a URL string; ' +
  'use files-download to turn a URL into a File.';

const describeExpectedType = (field: IFieldConfig): string => {
  if (!field.expectedType) return '';
  if (typeof field.expectedType === 'function') return " Its expected type depends on this node's other field values.";
  const base = ` Must evaluate to ${renderExpectedType(field.expectedType)}.`;
  return isFileReferenceType(field.expectedType) ? `${base}${FILE_REFERENCE_NOTE}` : base;
};

const EXPRESSION_DESCRIPTION =
  "A TypeScript expression, compiled verbatim as code and evaluated in this node's scope — e.g. " +
  "`message.chat.id`, `count + 1`, `'literal text'`. Not a template: never wrap a variable in `${…}` " +
  'here (`${message.chat.id}` is a syntax error — write `message.chat.id`).';

const describeSelectOptions = (field: IFieldConfig): string => {
  if (field.options)
    return ` Allowed values: ${field.options.map((option) => JSON.stringify(option.value)).join(', ')}.`;
  if (field.loadOptions) return ' The allowed values are fetched from the vendor at edit time.';
  return '';
};

/**
 * Plain-English, LLM-only (never shown in the UI, never translated) explanation of how a field's
 * stored string is interpreted by `@falang/workflow-compiler`'s `resolveFieldExpression` — attached
 * as the JSON Schema `description` of every field by `buildActionDataSchema`, so it reaches both the
 * in-app agent and every MCP host through `get_node_kinds`. Every field is a bare `{"type":"string"}`
 * otherwise, which gives an agent no way to tell an `expression` field (bare code, e.g.
 * `message.chat.id`) from a `template-string` one (literal text whose backticks the compiler adds and
 * escapes itself) — a real chat produced `"${message.chat.id}"` for Telegram's numeric `chatId` and
 * backtick-wrapped message texts that reached the user with the backticks still visible.
 */
export const describeFieldForAgent = (field: IFieldConfig): string => {
  switch (field.kind) {
    case 'expression': {
      return `${EXPRESSION_DESCRIPTION}${describeExpectedType(field)}`;
    }
    case 'template-string': {
      return (
        'Text compiled as the body of a JavaScript template literal: the surrounding backticks are added ' +
        'automatically, so do NOT wrap the value in backticks or quotes — they would be escaped and appear ' +
        'literally in the output. Insert runtime values with `${expr}`, e.g. `Hello, ${message.from.first_name}!`. ' +
        'Everything outside `${…}` is literal text: put a real line break for a new line, not the two ' +
        'characters `\\n`.'
      );
    }
    case 'text': {
      return 'Plain literal text used verbatim (compiled as a string literal) — not code, no `${…}` interpolation, no surrounding quotes.';
    }
    case 'select': {
      return `One of the allowed option values, verbatim, no surrounding quotes.${describeSelectOptions(field)}`;
    }
    case 'credential-ref': {
      const vendor = field.vendor ? ` of vendor "${field.vendor}"` : '';
      return `The id of an integration (credential) instance${vendor} from this project's integrations — the raw id, no quotes.`;
    }
    case 'result-type': {
      return 'A JSON-encoded type descriptor: either `{"type":"string"}` or `{"type":"struct","id":"<struct id>"}`.';
    }
    case 'new-variable': {
      return (
        'The name of a NEW variable this node declares and assigns its result to — a bare TypeScript ' +
        'identifier (e.g. `answer`), unique in scope, no quotes. Later sibling nodes can reference it.'
      );
    }
    default: {
      return 'A secret value, stored verbatim.';
    }
  }
};
