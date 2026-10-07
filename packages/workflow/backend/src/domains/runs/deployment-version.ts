import { defaultPayloadConverter } from '@temporalio/common';
import type { temporal } from '@temporalio/proto';

/**
 * Temporal's system search attribute holding the Worker Deployment Version that completed an
 * execution's last workflow task. Visibility (`ListWorkflowExecutions`) never fills
 * `WorkflowExecutionInfo.versioningInfo` — the server builds list rows from the visibility record,
 * which only carries search attributes — so for the runs list this is the only source of the version.
 */
export const DEPLOYMENT_VERSION_SEARCH_ATTRIBUTE = 'TemporalWorkerDeploymentVersion';

/**
 * Build ID out of a deployment version string: `<deploymentName>:<buildId>` (server ≥ 1.28) or the
 * older `<deploymentName>.<buildId>`. Our deployment names (`workflow-<uuid>`) and build IDs (`v<N>`)
 * contain neither delimiter, so the last one splits them. `__unversioned__` and blanks are `null`.
 */
export const buildIdFromDeploymentVersion = (version: string | null | undefined): string | null => {
  if (!version || version === '__unversioned__') return null;
  const colon = version.lastIndexOf(':');
  const index = colon === -1 ? version.lastIndexOf('.') : colon;
  const buildId = index === -1 ? '' : version.slice(index + 1);
  return buildId || null;
};

const decodePayload = (payload: temporal.api.common.v1.IPayload): unknown => {
  try {
    return defaultPayloadConverter.fromPayload(payload);
  } catch {
    return null;
  }
};

/** Decodes {@link DEPLOYMENT_VERSION_SEARCH_ATTRIBUTE} from raw search attributes into a build ID. */
export const buildIdFromSearchAttributes = (
  searchAttributes: temporal.api.common.v1.ISearchAttributes | null | undefined,
): string | null => {
  const payload = searchAttributes?.indexedFields?.[DEPLOYMENT_VERSION_SEARCH_ATTRIBUTE];
  if (!payload) return null;
  const value = decodePayload(payload);
  // Keyword attributes have been stored both as a plain string and as a one-element list.
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? buildIdFromDeploymentVersion(first) : null;
};
