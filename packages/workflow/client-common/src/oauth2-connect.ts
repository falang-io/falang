import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { getBackendOrigin, workflowApi } from './api-client.js';
import { openOAuth2Popup, type IOAuth2PopupResult } from './oauth2-popup.js';

export interface IOAuth2ConnectDeps {
  readonly projectId: string;
  readonly saveInstance: (instance: IIntegrationInstance) => void;
  readonly flushSave: () => Promise<void>;
  readonly refreshDocument: () => Promise<void>;
}

/**
 * Saves `instance` immediately (so it exists server-side before `/oauth2/start` is called), opens
 * the vendor's consent screen in a popup, and — on success — re-fetches the `integrations` document
 * so the caller's UI reflects the tokens the callback wrote server-side. See
 * `IntegrationsEditor`'s `handleConnect` and ADR 0015 (private).
 */
export const connectOAuth2Instance = async (
  deps: IOAuth2ConnectDeps,
  instance: IIntegrationInstance,
): Promise<IOAuth2PopupResult> => {
  deps.saveInstance(instance);
  await deps.flushSave();
  const { authorizeUrl } = await workflowApi.startOAuth2Authorization(deps.projectId, instance.id);
  const result = await openOAuth2Popup(authorizeUrl, instance.id, getBackendOrigin());
  if (result.status === 'success') await deps.refreshDocument();
  return result;
};
