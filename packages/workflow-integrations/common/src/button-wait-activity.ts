export const MESSAGE_BUTTON_WAIT_PREFIX = 'falang-wait:';

export const encodeButtonWaitCallback = (waitId: string, buttonIndex: number): string =>
  `${MESSAGE_BUTTON_WAIT_PREFIX}${waitId}:${buttonIndex}`;

export const decodeButtonWaitCallback = (data: unknown): { waitId: string; buttonIndex: number } | undefined => {
  if (typeof data !== 'string' || !data.startsWith(MESSAGE_BUTTON_WAIT_PREFIX)) return;
  const payload = data.slice(MESSAGE_BUTTON_WAIT_PREFIX.length);
  const separator = payload.lastIndexOf(':');
  if (separator <= 0) return;
  const waitId = payload.slice(0, separator);
  const buttonIndex = Number(payload.slice(separator + 1));
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0) return;
  return { waitId, buttonIndex };
};

/** Generated per-vendor helpers for the backend `button_waits` registry; sharedActivityCode emits them once. */
export const buildButtonWaitRegistryActivityCode = (vendor: string, prefix: string): string => {
  const contextName = `${prefix}ButtonWaitActivityContext`;
  return [
    `import { Context as ${contextName} } from '@temporalio/activity';`,
    `const ${prefix}RegisterButtonWait = async (`,
    '  waitId: string,',
    '  credentialId: string,',
    '  chatId: number,',
    '  messageId: string,',
    '  timeoutMs: number,',
    '): Promise<void> => {',
    `  const execution = ${contextName}.current().info.workflowExecution;`,
    "  if (!execution) throw new Error('A button wait can only be registered from a workflow activity');",
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    "  const env = process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev';",
    '  const response = await fetch(`${backendUrl}/internal/projects/${projectId}/button-waits`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    `    body: JSON.stringify({ waitId, vendor: ${JSON.stringify(vendor)}, credentialId, env, chatId: String(chatId), messageId, workflowId: execution.workflowId, runId: execution.runId, timeoutMs }),`,
    '  });',
    '  if (!response.ok) {',
    `    throw new Error(\`Registering the ${vendor} button wait failed: \${response.status} \${await response.text()}\`);`,
    '  }',
    '};',
    `const ${prefix}ReleaseButtonWait = async (waitId: string): Promise<void> => {`,
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    '  const response = await fetch(`${backendUrl}/internal/projects/${projectId}/button-waits/${encodeURIComponent(waitId)}`, {',
    "    method: 'DELETE',",
    "    headers: { 'x-internal-project-token': internalProjectToken },",
    '  });',
    '  if (!response.ok && response.status !== 404) {',
    `    throw new Error(\`Releasing the ${vendor} button wait failed: \${response.status} \${await response.text()}\`);`,
    '  }',
    '};',
  ].join('\n');
};
