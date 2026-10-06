import type { zod } from '@falang/dto';
import { isRecord } from './normalize-structure.js';

/** `JSON.parse`'s error, with a line/column the agent can find in the text it wrote. */
export const describeJsonError = (text: string, error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const position = /position (\d+)/.exec(message);
  if (!position) return `Invalid JSON: ${message}`;
  const offset = Number(position[1]);
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return `Invalid JSON at line ${line}, column ${column}: ${message}`;
};

/** The node a zod issue path points into, plus the path inside it — so an error names a node id and kind. */
const locateIssue = (
  root: unknown,
  path: readonly PropertyKey[],
): { where: string; node: Record<string, unknown> | null; rest: string } => {
  let current: unknown = root;
  let node: Record<string, unknown> | null = isRecord(root) ? root : null;
  let where = 'root';
  let nodeWhere = 'root';
  let restStart = 0;
  for (const [i, key] of path.entries()) {
    if (!isRecord(current) && !Array.isArray(current)) break;
    current = (current as Record<PropertyKey, unknown>)[key as string];
    where += typeof key === 'number' ? `[${key}]` : `.${String(key)}`;
    if (isRecord(current) && typeof current.name === 'string' && typeof current.id === 'string') {
      node = current;
      nodeWhere = where;
      restStart = i + 1;
    }
  }
  const rest = path.slice(restStart).map(String).join('.');
  return { node, rest, where: nodeWhere };
};

export const formatValidationError = (root: unknown, error: zod.ZodError): string =>
  error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path[0] === 'root' ? issue.path.slice(1) : issue.path;
      const { node, rest, where } = locateIssue(root, path);
      const label = node ? `${where} (${String(node.name)} ${String(node.id)})` : where;
      const hint = node ? ` — see schemas/${String(node.name)}.json` : '';
      return `${label}${rest ? ` ${rest}` : ''}: ${issue.message}${hint}`;
    })
    .join('\n');
