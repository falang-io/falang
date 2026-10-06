import type { NodesStack } from '@falang/dto';
import { zod } from '@falang/dto';

/**
 * How a template-literal-body field is described in a node kind's JSON Schema — `@falang/workflow-integrations-common`'s
 * `describeFieldForAgent` ("…the body of a JavaScript template literal…") and `@falang/typescript-dto`'s `log` message
 * ("…the body of a template literal…"). Matched on the schema rather than imported, so this package stays
 * domain-neutral: any kind whose data (or data property) is described this way is normalised on write (ADR 0062 §2.2).
 */
const TEMPLATE_FIELD_DESCRIPTION = /body of a (JavaScript )?template literal/;

/** Where the template text sits in a kind's `data`: whole-string data (`log`) and/or named object properties. */
export interface ITemplateFields {
  /** The whole `data` is a template body (a string-typed `data`, e.g. `log`'s message). */
  readonly whole: boolean;
  /** Object `data` properties that are template bodies. */
  readonly properties: readonly string[];
}

const NONE: ITemplateFields = { properties: [], whole: false };

const cache = new WeakMap<NodesStack, Map<string, ITemplateFields>>();

const describesTemplate = (description: unknown): boolean =>
  typeof description === 'string' && TEMPLATE_FIELD_DESCRIPTION.test(description);

const computeTemplateFields = (kind: string, stack: NodesStack): ITemplateFields => {
  const dataType = stack.configsMap.get(kind)?.data?.type;
  if (!dataType) return NONE;
  try {
    const schema = zod.toJSONSchema(dataType) as {
      type?: unknown;
      description?: unknown;
      properties?: Record<string, { description?: unknown }>;
    };
    if (schema.type === 'string') return describesTemplate(schema.description) ? { properties: [], whole: true } : NONE;
    const properties = Object.entries(schema.properties ?? {})
      .filter(([, prop]) => describesTemplate(prop.description))
      .map(([name]) => name);
    return properties.length > 0 ? { properties, whole: false } : NONE;
  } catch {
    return NONE;
  }
};

/** Which parts of `kind`'s `data` hold the body of a template literal. */
export const templateFieldsOfKind = (kind: string, stack: NodesStack): ITemplateFields => {
  let perStack = cache.get(stack);
  if (!perStack) {
    perStack = new Map();
    cache.set(stack, perStack);
  }
  const cached = perStack.get(kind);
  if (cached) return cached;
  const fields = computeTemplateFields(kind, stack);
  perStack.set(kind, fields);
  return fields;
};

/** The `data` properties of `kind` that hold the body of a template literal (none for a non-object `data`). */
export const templateFieldsOf = (kind: string, stack: NodesStack): readonly string[] =>
  templateFieldsOfKind(kind, stack).properties;

/** Index just past the quoted string (`'`, `"` or `` ` ``) that starts at `start`, honouring backslash escapes. */
const skipQuoted = (text: string, start: number): number => {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === '\\' ? 2 : 1;
  return i + 1;
};

/** Index just past the `${…}` that starts at `start` (pointing at `$`); string literals and nested braces respected. */
const skipInterpolation = (text: string, start: number): number => {
  let i = start + 2;
  let depth = 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuoted(text, i);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return i;
};

/**
 * Fixes the two "code inside a JSON string" slips in a template body (ADR 0062 §3): surrounding backticks (the
 * compiler adds its own, so they would reach the user verbatim) are stripped, and the two characters `\n` written in
 * the literal text — meant as a line break, since the compiler escapes backslashes there — become a real line break.
 * `${…}` interpolations are code and are left untouched (`${items.join('\n')}` stays as written).
 */
export const normalizeTemplateBody = (value: string): string => {
  const trimmed = value.trim();
  const body = trimmed.length >= 2 && trimmed.startsWith('`') && trimmed.endsWith('`') ? trimmed.slice(1, -1) : value;
  let out = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '$' && body[i + 1] === '{') {
      const end = skipInterpolation(body, i);
      out += body.slice(i, end);
      i = end;
    } else if (body[i] === '\\' && body[i + 1] === 'r' && body[i + 2] === '\\' && body[i + 3] === 'n') {
      out += '\n';
      i += 4;
    } else if (body[i] === '\\' && body[i + 1] === 'n') {
      out += '\n';
      i += 2;
    } else {
      out += body[i];
      i += 1;
    }
  }
  return out;
};
