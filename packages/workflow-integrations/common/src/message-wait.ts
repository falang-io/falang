import type { TVariableInfo } from '@falang/typescript-dto';
import type { IFieldConfig, IQuestionDescriptor } from './types.js';

/** Default of a reply wait's mandatory timeout field (ADR 0079 (private), decision 3). */
export const MESSAGE_WAIT_DEFAULT_TIMEOUT = '10m';
/** The variable a reply wait binds in its `message` branch. */
export const MESSAGE_WAIT_REPLY_VARIABLE = 'reply';

/**
 * `fn` run at most once, its promise shared — for work an ingress may need on two paths (a message handed to a wait,
 * or routed as usual) but must not repeat, e.g. resolving media.
 */
export const memoizeAsync = <T>(fn: () => Promise<T>): (() => Promise<T>) => {
  const cache: { promise?: Promise<T> } = {};
  return () => {
    cache.promise ??= fn();
    return cache.promise;
  };
};

/** What a vendor supplies to `buildMessageWaitQuestion` — everything else is shared. */
export interface IMessageWaitQuestionParams {
  /** The vendor id, sent to the backend registry (`telegram`, `max`, `vk`). */
  readonly vendor: string;
  /** Node kind, e.g. `telegram-wait-message`. */
  readonly name: string;
  /** i18n key of the node title. */
  readonly label: string;
  /** Activity name prefix: `<prefix>WaitForMessage` / `<prefix>ReleaseMessageWait`. Unique per vendor (one activities module). */
  readonly prefix: string;
  /** The signal the ingress sends the waiting run, payload `{ waitId, message }`. */
  readonly signalName: string;
  /** The reply's type — the vendor's incoming message struct. */
  readonly messageType: TVariableInfo;
  /** "Who/where": the vendor's `credential-ref` field and its chat id expression (`number`), in this order. */
  readonly credentialField: IFieldConfig;
  readonly chatIdField: IFieldConfig;
  /** Labels/help of the two shared fields (i18n keys of the vendor's namespace). */
  readonly fromUserLabel: string;
  readonly fromUserHelp?: string;
  readonly timeoutLabel: string;
  readonly timeoutHelp?: string;
}

const TIMEOUT_AGENT_NOTES =
  'Required, never empty: how long to wait, a number followed by ms, s, m, h or d, e.g. `10m`, `2h`, `1d` ' +
  '(default `10m`). When it runs out the `timeout` branch runs.';

const FROM_USER_AGENT_NOTES =
  'Optional. Empty = the next message from anyone in the chat (a private chat has only one user). Set it to a ' +
  'user id expression (e.g. `message.from.id`) to wait for one person in a group.';

/** The generated lines of one backend registry call from the pod (`response` in scope afterwards). */
const backendCall = (method: 'POST' | 'DELETE', pathSuffix: string, body: string | null): string[] => [
  '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
  '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
  '  const projectId = process.env.PROJECT_ID;',
  '  if (!backendUrl || !internalProjectToken || !projectId) {',
  "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
  '  }',
  `  const response = await fetch(\`\${backendUrl}/internal/projects/\${projectId}/message-waits${pathSuffix}\`, {`,
  `    method: '${method}',`,
  "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
  ...(body ? [`    body: ${body},`] : []),
  '  });',
];

/**
 * The registry calls run inside the pod: `POST /internal/projects/:projectId/message-waits` (the run's own
 * workflow/run id from the activity context) and `DELETE …/:waitId`, with the project token — the same env
 * vars every vendor's credential resolver reads. Generated per vendor (prefixed names), since every vendor's
 * activity code ends up in one module; the import line is identical across vendors and deduplicated.
 */
const buildActivityCode = (params: IMessageWaitQuestionParams): { ask: string; close: string } => {
  const { prefix, vendor } = params;
  const ask = [
    "import { Context as messageWaitActivityContext } from '@temporalio/activity';",
    `export const ${prefix}WaitForMessage = async (`,
    '  credentialId: string,',
    '  chatId: number,',
    '  fromUserId: number | string | undefined,',
    '  timeoutMs: number,',
    '): Promise<{ messageId: string }> => {',
    '  const execution = messageWaitActivityContext.current().info.workflowExecution;',
    "  if (!execution) throw new Error('A message wait can only be registered from a workflow activity');",
    '  const { workflowId, runId } = execution;',
    "  const userId = fromUserId === undefined || String(fromUserId) === '' ? null : String(fromUserId);",
    "  const env = process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev';",
    ...backendCall(
      'POST',
      '',
      `JSON.stringify({ vendor: '${vendor}', credentialId, env, chatId: String(chatId), userId, workflowId, runId, timeoutMs })`,
    ),
    '  if (!response.ok) {',
    `    throw new Error(\`Registering the ${vendor} message wait failed: \${response.status} \${await response.text()}\`);`,
    '  }',
    '  const data = (await response.json()) as { waitId: string };',
    '  return { messageId: data.waitId };',
    '};',
  ].join('\n');
  const close = [
    `export const ${prefix}ReleaseMessageWait = async (`,
    '  _credentialId: string,',
    '  _chatId: number,',
    '  waitId: string,',
    '  _reason: string,',
    '): Promise<void> => {',
    ...backendCall('DELETE', '/${encodeURIComponent(waitId)}', null),
    // 404 = already claimed or swept: nothing left to release.
    '  if (!response.ok && response.status !== 404) {',
    `    throw new Error(\`Releasing the ${vendor} message wait failed: \${response.status} \${await response.text()}\`);`,
    '  }',
    '};',
  ].join('\n');
  return { ask, close };
};

/**
 * The "wait for the user's message" node of a messenger vendor (ADR 0079 (private)) — an `IQuestionDescriptor`
 * with `replyWait`: fields bot / chat / from user (optional) / timeout (mandatory, default `10m`), two fixed
 * branches `message` (with `reply`) and `timeout`. The vendor's ingress delivers the message through
 * `IIntegrationBackendContext.deliverToMessageWait` with the same `signalName`.
 */
export const buildMessageWaitQuestion = (params: IMessageWaitQuestionParams): IQuestionDescriptor => {
  const { ask, close } = buildActivityCode(params);
  const { prefix } = params;
  return {
    name: params.name,
    label: params.label,
    answerSignalName: params.signalName,
    contextFields: [params.credentialField, { ...params.chatIdField, fieldSize: 'small' }],
    questionFields: [
      {
        name: 'fromUserId',
        label: params.fromUserLabel,
        ...(params.fromUserHelp ? { help: params.fromUserHelp } : {}),
        agentNotes: FROM_USER_AGENT_NOTES,
        kind: 'expression',
        expectedType: { type: 'number', numberType: { type: 'any' } },
        fieldSize: 'small',
        defaultValue: '',
      },
      {
        name: 'timeout',
        label: params.timeoutLabel,
        ...(params.timeoutHelp ? { help: params.timeoutHelp } : {}),
        agentNotes: TIMEOUT_AGENT_NOTES,
        kind: 'text',
        defaultValue: MESSAGE_WAIT_DEFAULT_TIMEOUT,
      },
    ],
    timeoutField: 'timeout',
    replyWait: { variableName: MESSAGE_WAIT_REPLY_VARIABLE, messageType: params.messageType },
    askActivitySignature: `${prefix}WaitForMessage(credentialId: string, chatId: number, fromUserId: number | string | undefined, timeoutMs: number): Promise<{ messageId: string }>`,
    askActivityCode: ask,
    closeActivitySignature: `${prefix}ReleaseMessageWait(credentialId: string, chatId: number, messageId: string, reason: string): Promise<void>`,
    closeActivityCode: close,
  };
};
