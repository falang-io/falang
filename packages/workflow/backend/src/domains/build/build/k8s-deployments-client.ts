import { ApiException, type AppsV1Api, type V1Deployment } from '@kubernetes/client-node';

/**
 * The slice of `@kubernetes/client-node`'s `AppsV1Api` `RunnerProcessManager` actually needs —
 * kept minimal for testability (mirrors `runner-process-manager.ts`'s pre-k8s `TSpawnProcess`
 * pattern: a real implementation wraps the SDK, unit tests inject a fake).
 */
export interface IK8sDeploymentsClient {
  /** Creates the Deployment, or replaces it in place if one with this name already exists. */
  apply(namespace: string, deployment: V1Deployment): Promise<void>;
  /** Deletes the Deployment; a no-op if it doesn't exist. */
  delete(namespace: string, name: string): Promise<void>;
  /** Whether a Deployment with this name currently exists. */
  exists(namespace: string, name: string): Promise<boolean>;
  /** Names of every Deployment matching `labelSelector` (e.g. `taskQueue=workflow-1`). */
  listNames(namespace: string, labelSelector: string): Promise<string[]>;
  /** Name + labels of every Deployment matching `labelSelector` — like `listNames`, but keeps the labels `RunnerProcessManager.listRunning()` reads back off (task queue, project id, env). */
  listAll(namespace: string, labelSelector: string): Promise<{ name: string; labels: Record<string, string> }[]>;
}

const isApiExceptionWithCode = (error: unknown, code: number): boolean =>
  error instanceof ApiException && error.code === code;

/** The current Deployment's `resourceVersion`, or `null` if none exists yet — `replaceNamespacedDeployment` needs it to target the right optimistic-concurrency revision. */
const readCurrentResourceVersion = async (appsApi: AppsV1Api, namespace: string, name: string): Promise<string | null> => {
  try {
    const current = await appsApi.readNamespacedDeployment({ name, namespace });
    return current.metadata?.resourceVersion ?? null;
  } catch (error) {
    if (isApiExceptionWithCode(error, 404)) return null;
    throw error;
  }
};

/** Real implementation, backed by a live `AppsV1Api` client — see `RunnerProcessManager`'s factory in `build.module.ts`. */
export const createK8sDeploymentsClient = (appsApi: AppsV1Api): IK8sDeploymentsClient => ({
  async apply(namespace, deployment) {
    const name = deployment.metadata?.name;
    if (!name) throw new Error('Deployment must have metadata.name');

    const resourceVersion = await readCurrentResourceVersion(appsApi, namespace, name);
    if (resourceVersion === null) {
      await appsApi.createNamespacedDeployment({ namespace, body: deployment });
      return;
    }
    await appsApi.replaceNamespacedDeployment({
      name,
      namespace,
      body: { ...deployment, metadata: { ...deployment.metadata, resourceVersion } },
    });
  },

  async delete(namespace, name) {
    try {
      await appsApi.deleteNamespacedDeployment({ name, namespace });
    } catch (error) {
      if (!isApiExceptionWithCode(error, 404)) throw error;
    }
  },

  async exists(namespace, name) {
    try {
      await appsApi.readNamespacedDeployment({ name, namespace });
      return true;
    } catch (error) {
      if (isApiExceptionWithCode(error, 404)) return false;
      throw error;
    }
  },

  async listNames(namespace, labelSelector) {
    const result = await appsApi.listNamespacedDeployment({ namespace, labelSelector });
    // oxlint-disable-next-line unicorn/prefer-native-coercion-functions -- the type predicate (not just truthiness) is what narrows this to `string[]`; bare `Boolean` doesn't.
    return result.items.map((item) => item.metadata?.name).filter((name): name is string => Boolean(name));
  },

  async listAll(namespace, labelSelector) {
    const result = await appsApi.listNamespacedDeployment({ namespace, labelSelector });
    const items: { name: string; labels: Record<string, string> }[] = [];
    for (const item of result.items) {
      const name = item.metadata?.name;
      if (!name) continue;
      items.push({ name, labels: item.metadata?.labels ?? {} });
    }
    return items;
  },
});
