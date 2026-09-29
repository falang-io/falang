const LOG_ACTIVITY_CODE = [
  "import { log } from '@temporalio/activity';",
  '',
  '/**',
  " * Registered as a real Worker activity (see `@falang/workflow-runner`'s `startRunner`), so every",
  ' * `log` node in a compiled workflow (via `proxyLocalActivities`, see the workflows module) becomes',
  " * a `MarkerRecorded` history event, visible in Temporal Web UI — unlike `@temporalio/workflow`'s",
  " * replay-local `log.info()`, which only reaches this process's stderr. Also logs through the",
  ' * Activity Context so it still shows up there too.',
  ' *',
  " * Must return `message`: a Local Activity marker only persists the activity's *result* (needed",
  ' * for replay), not its input (recomputed deterministically by the workflow code on replay',
  ' * instead) — so returning `void` here would make the message invisible in the marker despite',
  ' * this whole mechanism existing to surface it there.',
  ' */',
  'export const logActivity = (message: string): string => {',
  '  log.info(message);',
  '  return message;',
  '};',
].join('\n');

/**
 * Backs the single generic `activepieces-action` node kind (see `@falang/workflow-dto`'s
 * `activepieces-action-nodes.ts` and ADR 0010 (private)) — unlike
 * every other activity-backed node kind, this one isn't emitted per registered `IWorkflowIntegration`
 * (there is no `IActionDescriptor` for it at all, since its field list varies per node instance, not
 * per node kind — see the ADR). Always emitted unconditionally, same reasoning as `logActivity`
 * below. Makes an HTTP call to the standalone `falang-workflow-activepieces` service — `pieceName`/
 * `actionName` are runtime string arguments here, not baked into the function name, since one
 * activity backs every piece/action combination.
 */
const RUN_ACTIVEPIECES_ACTION_CODE = [
  'export const runActivepiecesAction = async (',
  '  credentialId: string,',
  '  pieceName: string,',
  '  actionName: string,',
  '  propsValue: Record<string, unknown>,',
  '): Promise<unknown> => {',
  '  const baseUrl = process.env.ACTIVEPIECES_SERVICE_URL;',
  '  const secret = process.env.ACTIVEPIECES_SERVICE_SECRET;',
  '  if (!baseUrl || !secret) {',
  "    throw new Error('ACTIVEPIECES_SERVICE_URL/ACTIVEPIECES_SERVICE_SECRET are not configured for this runner process');",
  '  }',
  '  // Forwarded so the activepieces service can present this token back to the backend credential',
  '  // resolver, scoped to this project — see ADR 0016 (private).',
  '  // Unrelated to ACTIVEPIECES_SERVICE_SECRET above, which only authorizes this call itself',
  '  // (runner pod -> activepieces service).',
  '  const projectId = process.env.PROJECT_ID;',
  '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
  '  if (!projectId || !internalProjectToken) {',
  "    throw new Error('PROJECT_ID/INTERNAL_PROJECT_TOKEN are not configured for this runner process');",
  '  }',
  '  const response = await fetch(',
  '    `${baseUrl}/credentials/${credentialId}/pieces/${pieceName}/actions/${actionName}/run`,',
  '    {',
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': secret },",
  '      body: JSON.stringify({ propsValue, projectId, internalProjectToken }),',
  '    },',
  '  );',
  '  if (!response.ok) {',
  '    throw new Error(`activepieces service call failed: ${response.status} ${await response.text()}`);',
  '  }',
  '  const data = (await response.json()) as { result: unknown };',
  '  return data.result;',
  '};',
].join('\n');

const IMPORT_LINE_START = /^import\b/;

interface IExtractedImports {
  /** Each entry is one whole `import …;` statement — a single line, or a joined multi-line one. */
  readonly imports: readonly string[];
  /** `code` with every extracted import statement's lines removed, leading/trailing blank lines trimmed. */
  readonly rest: string;
}

/**
 * Pulls every `import …;` statement out of a code block, leaving the remaining lines in their
 * original order and relative position. A statement is a line (trimmed) starting with `import`;
 * if it doesn't already end with `';'` (a multi-line `import {` … `} from '…';`), subsequent lines
 * are folded into the same statement until one does.
 *
 * Used by `compileActivities` to hoist and deduplicate imports across every block it concatenates —
 * see that function's own doc for why: two native OAuth2 integrations' `sharedActivityCode` (amoCRM,
 * Diadoc — ADR 0017 (private)) both start with the identical
 * `import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';` line, which
 * throws `Duplicate identifier` from `typeCheckProject` once concatenated verbatim into one module.
 */
const extractImports = (code: string): IExtractedImports => {
  const lines = code.split('\n');
  const imports: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!IMPORT_LINE_START.test(line.trim())) {
      rest.push(line);
      continue;
    }
    const statementLines = [line];
    while (!statementLines.at(-1)?.trimEnd().endsWith("';") && i + 1 < lines.length) {
      i += 1;
      statementLines.push(lines[i]);
    }
    imports.push(statementLines.join('\n'));
  }
  return { imports, rest: rest.join('\n').replace(/^\n+/, '').replace(/\n+$/, '') };
};

/**
 * Compiles the Activity implementations backing every activity-backed DSL node kind into a single
 * TypeScript module. Used by `compileProject` alongside the workflow-functions module:
 * `@falang/workflow-runner`'s `startRunner` loads this compiled module at the path it's written to
 * and registers it as the Temporal Worker's `activities`, instead of importing a hand-maintained
 * sibling file.
 *
 * `log`'s `logActivity` (see ADR 0001 (private)'s `log` row) is always emitted unconditionally,
 * regardless of whether the project's documents actually use it — scanning the project tree to
 * decide what to emit isn't worth the complexity yet for one built-in activity. `extraActivityCode`
 * (each registered vendor's `IActionDescriptor.activityCode`, see ADR 0006) is emitted the same way:
 * unconditionally, for the same reason — revisit both once this gets wasteful.
 *
 * Every block's own `import …;` statements are hoisted out and deduplicated (string-identical
 * lines only) into one set emitted once at the top of the module, ahead of everything else, rather
 * than left inline per block — two blocks importing the exact same thing (e.g. two vendors' shared
 * OAuth2 helper import) would otherwise redeclare the same local binding twice and fail to
 * type-check once concatenated. Each block's remaining, import-stripped lines keep their original
 * order relative to one another.
 */
export const compileActivities = (extraActivityCode: readonly string[] = []): string => {
  const blocks = [LOG_ACTIVITY_CODE, RUN_ACTIVEPIECES_ACTION_CODE, ...extraActivityCode];
  const seenImports = new Set<string>();
  const hoistedImports: string[] = [];
  const bodies: string[] = [];
  for (const block of blocks) {
    const { imports, rest } = extractImports(block);
    for (const statement of imports) {
      if (!seenImports.has(statement)) {
        seenImports.add(statement);
        hoistedImports.push(statement);
      }
    }
    bodies.push(rest);
  }
  return [...(hoistedImports.length > 0 ? [hoistedImports.join('\n')] : []), ...bodies, ''].join('\n\n');
};
