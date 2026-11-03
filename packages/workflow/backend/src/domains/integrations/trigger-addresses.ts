import { TRIGGER_FUNCTION_BODY_NAME } from '@falang/workflow-dto';
import type { INode } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';

/** The path placeholder that makes a trigger's inbound URL its own — present only where the user pastes the URL somewhere. */
const TRIGGER_FUNCTION_ID_PLACEHOLDER = ':triggerFunctionId';

export interface ITriggerAddress {
  readonly documentId: string;
  readonly documentName: string;
  readonly vendor: string;
  readonly triggerName: string;
  /** `/webhooks/<vendor>/<projectId>/<credentialId>/dev/<documentId>` — always set. */
  readonly devPath: string;
  readonly prodPath: string;
  /** The same paths on the public host; `null` when the server has no public address configured. */
  readonly devUrl: string | null;
  readonly prodUrl: string | null;
}

interface ITriggerDocument {
  readonly id: string;
  readonly name: string;
  readonly root: INode | null;
}

const fillPath = (template: string, values: Record<string, string>): string =>
  template.replaceAll(/:([A-Za-z]+)/g, (match, name: string) =>
    name in values ? encodeURIComponent(values[name] ?? '') : match,
  );

interface ITriggerBinding {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
}

const readString = (data: Record<string, unknown> | undefined, key: string): string => {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
};

/** The trigger body's binding (`[function-header, trigger-function-body, function-footer]`); `null` when incomplete. */
const readBinding = (root: INode | null): ITriggerBinding | null => {
  const body = root?.children?.[1];
  if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return null;
  const data = body.data as Record<string, unknown> | undefined;
  const binding = {
    vendor: readString(data, 'vendor'),
    triggerName: readString(data, 'triggerName'),
    credentialId: readString(data, 'credentialId'),
  };
  return binding.vendor && binding.credentialId ? binding : null;
};

/**
 * The inbound URLs of the project's trigger functions whose vendor expects the user to paste the URL into a third-party
 * service (the generic webhook, Bitrix24's outgoing webhook, YooKassa notifications): exactly the triggers whose
 * `webhookPath` carries `:triggerFunctionId`. Vendors that subscribe themselves (Telegram, MAX, VK, amoCRM) or poll
 * are left out. The path is the gateway's `POST /webhooks/:vendor/:projectId/:credentialId/:env/:uri` route.
 */
export const buildTriggerAddresses = (params: {
  baseUrl: string | null;
  projectId: string;
  documents: readonly ITriggerDocument[];
  integrations: readonly IWorkflowIntegration[];
}): ITriggerAddress[] => {
  const base = params.baseUrl?.trim().replace(/\/+$/, '') || null;
  const result: ITriggerAddress[] = [];
  for (const document of params.documents) {
    const binding = readBinding(document.root);
    if (!binding) continue;
    const descriptor = params.integrations
      .find((integration) => integration.vendor === binding.vendor)
      ?.triggers.find((trigger) => trigger.name === binding.triggerName);
    if (!descriptor?.webhookPath.includes(TRIGGER_FUNCTION_ID_PLACEHOLDER)) continue;
    const pathFor = (env: 'dev' | 'prod'): string =>
      fillPath(descriptor.webhookPath, {
        projectId: params.projectId,
        credentialId: binding.credentialId,
        env,
        triggerFunctionId: document.id,
      });
    const devPath = pathFor('dev');
    const prodPath = pathFor('prod');
    result.push({
      documentId: document.id,
      documentName: document.name,
      vendor: binding.vendor,
      triggerName: binding.triggerName,
      devPath,
      prodPath,
      devUrl: base ? `${base}${devPath}` : null,
      prodUrl: base ? `${base}${prodPath}` : null,
    });
  }
  return result.toSorted((a, b) => a.documentName.localeCompare(b.documentName));
};
