/**
 * Run-journal runtime for compiled workflows — see ADR 0059 (private) §2a and `RUN_JOURNAL_CONTRACT`.
 *
 * Workflow code cannot do I/O, and a local activity would add a history event and make the workflow
 * await it. The journal therefore goes through a Temporal **sink** (`proxySinks`): a fire-and-forget
 * call delivered to the Worker after the activation completes, not recorded in history and — the
 * runner registers it with `callDuringReplay: false` — not repeated on replay. `__falangJournal(entry)`
 * adds a deterministic `seq` (module-level counter, per execution since the workflows module is
 * isolated per execution) and the workflow-time `ts`, defaults `documentId`/`nodeId` from the
 * position runtime's top frame (only when position tracking is compiled in) and swallows every
 * error: a journal problem never fails a workflow.
 */

import {
  POSITION_STACK_EXPORT,
  RUN_JOURNAL_NODE_HEADER,
  RUN_JOURNAL_SINK_METHOD,
  RUN_JOURNAL_SINK_NAME,
  RUN_JOURNAL_WORKFLOW_FN,
} from '@falang/workflow-dto';

/** Sink name the runner registers (`Worker.create({ sinks: { falangJournal: { append } } })`). */
export const JOURNAL_SINK_NAME = RUN_JOURNAL_SINK_NAME;
/** Name of the module-level helper the compiled code calls. */
export const JOURNAL_FN = RUN_JOURNAL_WORKFLOW_FN;

/** Imports from `@temporalio/workflow` the journal runtime needs on top of the common set. */
export const JOURNAL_RUNTIME_IMPORTS = ['proxySinks'] as const;

/**
 * The runtime itself — plain TS, type-checked by `typeCheckProject` like the rest of the module.
 * `trackPosition` adds the top-frame default for `documentId`/`nodeId` (the frame stack only exists
 * then).
 */
export const buildJournalRuntimeCode = (trackPosition: boolean): string =>
  [
    `const { ${JOURNAL_SINK_NAME} } = proxySinks<{ ${JOURNAL_SINK_NAME}: { ${RUN_JOURNAL_SINK_METHOD}(entry: unknown): void } }>();`,
    'interface __FalangJournalEntry {',
    "  kind: 'log' | 'trigger' | 'user-input' | 'ai' | 'message-out' | 'error';",
    "  level: 'info' | 'warn' | 'error';",
    '  message: string;',
    '  data?: Record<string, unknown>;',
    '  documentId?: string;',
    '  nodeId?: string;',
    '  vendor?: string;',
    '}',
    'let __falangJournalSeq = 0;',
    `const ${JOURNAL_FN} = (entry: __FalangJournalEntry): void => {`,
    '  try {',
    ...(trackPosition
      ? [
          `    const frame = ${POSITION_STACK_EXPORT}[${POSITION_STACK_EXPORT}.length - 1];`,
          '    const position = frame ? { documentId: frame.documentId, ...(frame.nodeId ? { nodeId: frame.nodeId } : {}) } : {};',
        ]
      : ['    const position = {};']),
    '    __falangJournalSeq += 1;',
    `    ${JOURNAL_SINK_NAME}.${RUN_JOURNAL_SINK_METHOD}({ ...position, ...entry, seq: __falangJournalSeq, ts: Date.now() });`,
    '  } catch {',
    '    // The journal never fails a workflow.',
    '  }',
    '};',
  ].join('\n');

/** File name the build writes the interceptor module under, next to `workflows.ts`. */
export const JOURNAL_INTERCEPTORS_FILENAME = 'journal-interceptors.ts';

/** Header key the activity-side interceptor reads (`RUN_JOURNAL_CONTRACT` §3). */
export const JOURNAL_NODE_HEADER = RUN_JOURNAL_NODE_HEADER;

/**
 * Workflow outbound interceptor module (ADR 0059 (private) §2b): puts the position stack's top frame
 * into a `falang-node` header on every scheduled (local) activity so the runner's activity wrapper
 * can attribute entries to a node. Generated here — not a TS file inside this package — because
 * Temporal's swc rule skips `node_modules` except the build directory (`includeBuildDirInTsRule`),
 * and the cloud image installs packages there; the build writes it into the same directory as
 * `workflows.ts` and passes it as `workflowInterceptorModules`. It reads the frame stack through the
 * `__falangPositionStack` export of the workflows module (the same module instance the workflow
 * runs, so the stack is the execution's own); only emitted/useful when position tracking is on.
 */
export const JOURNAL_INTERCEPTORS_MODULE = [
  "import { defaultPayloadConverter } from '@temporalio/workflow';",
  "import type { Headers, WorkflowInterceptors } from '@temporalio/workflow';",
  `import { ${POSITION_STACK_EXPORT} } from './workflows';`,
  '',
  'const withNodeHeader = <T extends { readonly headers: Headers }>(input: T): T => {',
  `  const frame = ${POSITION_STACK_EXPORT}[${POSITION_STACK_EXPORT}.length - 1];`,
  '  if (!frame) return input;',
  '  const payload = defaultPayloadConverter.toPayload({ documentId: frame.documentId, nodeId: frame.nodeId });',
  `  return payload ? { ...input, headers: { ...input.headers, '${JOURNAL_NODE_HEADER}': payload } } : input;`,
  '};',
  '',
  'export const interceptors = (): WorkflowInterceptors => ({',
  '  outbound: [',
  '    {',
  '      scheduleActivity: (input, next) => next(withNodeHeader(input)),',
  '      scheduleLocalActivity: (input, next) => next(withNodeHeader(input)),',
  '    },',
  '  ],',
  '});',
  '',
].join('\n');

/** True when `workflows` was compiled with position tracking — the only case the interceptor module has a stack to read. */
export const needsJournalInterceptors = (workflows: string): boolean =>
  workflows.includes(`export const ${POSITION_STACK_EXPORT}`);
