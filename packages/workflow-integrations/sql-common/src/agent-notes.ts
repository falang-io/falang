import { dialectByName } from './dialects.js';
import type { TSqlDialectName } from './schema-types.js';

/**
 * `IFieldConfig.agentNotes` (plain English, LLM-only) for the `where` operator DSL — shared by the SQL
 * vendors and `@falang/workflow-integrations-tables`, which reuses the same filter structs (ADR 0039 (private) §5).
 * `noun` is what the keys are called: `column` (SQL) or `field` (project tables).
 */
export const buildWhereAgentNotes = (noun: 'column' | 'field', opts: { readonly required: boolean }): string =>
  [
    `An object literal mapping ${noun} name → value (equality) or an operator object:`,
    '`{ maxId: user.id }`, `{ age: { gt: 18 } }`, `{ status: { in: ["new", "open"] } }`,',
    '`{ name: { contains: "Iv" } }`, `{ phone: { isNull: true } }`.',
    'Operators: eq, ne, gt, gte, lt, lte, in, notIn, isNull; strings also like, ilike, startsWith, contains.',
    `Several keys = all must match; \`{ or: [ {...}, {...} ] }\` / \`{ and: [...] }\` combine. Quote a ${noun} name that is not an identifier.`,
    'Never write a comparison such as `maxId = user.id` or `maxId == user.id` — that is not a filter.',
    opts.required
      ? `Required — to match every row write it explicitly, e.g. \`{ id: { isNull: false } }\`.`
      : 'Empty — no filter (every row).',
  ].join(' ');

/** `agentNotes` for the comma-separated `orderBy` text field. */
export const buildOrderByAgentNotes = (noun: 'column' | 'field'): string =>
  `Comma-separated ${noun} names, each optionally followed by asc (default) or desc, e.g. \`createdAt desc\` or \`status, createdAt desc\`. Plain text, no quotes. Empty — no ordering.`;

/** `agentNotes` for the raw SQL text and its `params` array — the placeholder syntax depends on the dialect. */
export const buildRawSqlAgentNotes = (dialectName: TSqlDialectName): { sql: string; params: string } => {
  const dialect = dialectByName(dialectName);
  const placeholders = [1, 2].map((index) => dialect.placeholder(index)).join(', ');
  return {
    sql: `Raw SQL. Pass values only through placeholders (${placeholders}, …), never by building the SQL text from variables, e.g. \`select * from orders where user_id = ${dialect.placeholder(1)}\`.`,
    params: 'An array literal with the placeholder values in order, e.g. `[user.id, "new"]`. Empty — no parameters.',
  };
};
