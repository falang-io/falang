import {
  SECRET_MASK,
  type IEnvironmentValue,
  type IFieldConfig,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { decryptSecret, encryptSecret } from './credentials-crypto.js';

export { SECRET_MASK };

const isEnvironmentValue = (value: unknown): value is IEnvironmentValue =>
  typeof value === 'object' && value !== null && 'dev' in value && 'prod' in value;

const findIntegration = (
  integrations: readonly IWorkflowIntegration[],
  vendor: string,
): IWorkflowIntegration | undefined => integrations.find((integration) => integration.vendor === vendor);

const findPreviousInstance = (
  previous: IIntegrationsDocumentData | null,
  instanceId: string,
): IIntegrationInstance | undefined => previous?.instances.find((instance) => instance.id === instanceId);

const encodeSecretValue = (incoming: string, previousEncrypted: string, encryptionKey: Buffer): string => {
  if (incoming === SECRET_MASK) return previousEncrypted;
  if (incoming === '') return '';
  return encryptSecret(incoming, encryptionKey);
};

/**
 * Called before persisting an `integrations` document (`DocumentsService.create`/`update`):
 * encrypts every `secret`-kind field's `dev`/`prod` values. A value equal to `SECRET_MASK` means the
 * client echoed back the mask unchanged — the previously stored (encrypted) value is kept instead of
 * encrypting the literal mask string. An empty string means "no value configured for this env".
 */
export const encodeIntegrationsDataForWrite = (
  incoming: IIntegrationsDocumentData,
  previous: IIntegrationsDocumentData | null,
  integrations: readonly IWorkflowIntegration[],
  encryptionKey: Buffer,
): IIntegrationsDocumentData => ({
  instances: incoming.instances.map((instance) => {
    const integration = findIntegration(integrations, instance.vendor);
    if (!integration) return instance;
    const previousInstance = findPreviousInstance(previous, instance.id);

    const fields: Record<string, IEnvironmentValue | string> = {};
    for (const field of integration.credentialFields) {
      const raw = instance.fields[field.name];
      // A falsy `raw` (missing key or an already-empty string) needs no per-kind handling — an
      // empty string is the correct "nothing configured" value for every field kind, secret or not.
      if (field.kind !== 'secret' || !raw) {
        fields[field.name] = raw ?? '';
        continue;
      }
      const incomingValue = isEnvironmentValue(raw) ? raw : { dev: '', prod: '' };
      const previousRaw = previousInstance?.fields[field.name];
      const previousValue = previousRaw && isEnvironmentValue(previousRaw) ? previousRaw : { dev: '', prod: '' };
      fields[field.name] = {
        dev: encodeSecretValue(incomingValue.dev, previousValue.dev, encryptionKey),
        prod: encodeSecretValue(incomingValue.prod, previousValue.prod, encryptionKey),
      };
    }
    return { ...instance, fields };
  }),
});

/**
 * Called before returning an `integrations` document to the client (`DocumentsService`'s read
 * paths): replaces every `secret`-kind field's encrypted `dev`/`prod` value with `SECRET_MASK` (or
 * `''` if no value is configured for that env) — plaintext and ciphertext alike never reach the
 * browser.
 */
export const maskIntegrationsDataForRead = (
  data: IIntegrationsDocumentData,
  integrations: readonly IWorkflowIntegration[],
): IIntegrationsDocumentData => ({
  instances: data.instances.map((instance) => {
    const integration = findIntegration(integrations, instance.vendor);
    if (!integration) return instance;

    const fields: Record<string, IEnvironmentValue | string> = {};
    for (const field of integration.credentialFields) {
      const raw = instance.fields[field.name];
      if (field.kind !== 'secret' || !raw) {
        fields[field.name] = raw ?? '';
        continue;
      }
      const value = isEnvironmentValue(raw) ? raw : { dev: '', prod: '' };
      fields[field.name] = { dev: value.dev ? SECRET_MASK : '', prod: value.prod ? SECRET_MASK : '' };
    }
    return { ...instance, fields };
  }),
});

/**
 * Called by `ProjectExportService` when building an export payload: unlike `maskIntegrationsDataForRead`,
 * every `secret`-kind field's `dev`/`prod` value is unconditionally blanked to `''` rather than
 * `SECRET_MASK`. `SECRET_MASK` is a "keep the existing encrypted value" sentinel understood only by
 * `encodeIntegrationsDataForWrite` when a *previous* stored value exists for that instance — an
 * exported document has no such previous value on import, so echoing `SECRET_MASK` back would either
 * resolve to an empty value by accident or, worse, collide with a real value if the export were ever
 * merged into an existing document. An explicit `''` has one unambiguous meaning: "not configured."
 */
export const stripIntegrationsSecretsForExport = (
  data: IIntegrationsDocumentData,
  integrations: readonly IWorkflowIntegration[],
): IIntegrationsDocumentData => ({
  instances: data.instances.map((instance) => {
    const integration = findIntegration(integrations, instance.vendor);
    if (!integration) return instance;

    const fields: Record<string, IEnvironmentValue | string> = {};
    for (const field of integration.credentialFields) {
      const raw = instance.fields[field.name];
      fields[field.name] = field.kind === 'secret' ? { dev: '', prod: '' } : (raw ?? '');
    }
    return { ...instance, fields };
  }),
});

/**
 * Called by `VersioningService.restore` (ADR 0025 (private), decision 1): a
 * restored `integrations` document takes its instance list and every non-secret field from the
 * snapshot (which never carries real secret values, see `stripIntegrationsSecretsForExport`), but
 * keeps each surviving instance's *currently stored* (still-encrypted) secret values rather than
 * wiping them — restoring an old commit must not silently blank a live credential. An instance id
 * only present in the snapshot (deleted, then the deleting commit restored) has no `current` value to
 * carry over and comes back with empty secrets, the same "dangling credential" situation an import
 * already has. Never touches `encryptionKey` — every value handled here is either already-encrypted
 * (carried over verbatim) or a non-secret plaintext field, so no encrypt/decrypt step is needed.
 */
export const mergeIntegrationsDataForRestore = (
  snapshot: IIntegrationsDocumentData,
  current: IIntegrationsDocumentData | null,
  integrations: readonly IWorkflowIntegration[],
): IIntegrationsDocumentData => ({
  instances: snapshot.instances.map((instance) => {
    const integration = findIntegration(integrations, instance.vendor);
    if (!integration) return instance;
    const currentInstance = findPreviousInstance(current, instance.id);

    const fields: Record<string, IEnvironmentValue | string> = {};
    for (const field of integration.credentialFields) {
      if (field.kind !== 'secret') {
        fields[field.name] = instance.fields[field.name] ?? '';
        continue;
      }
      const currentRaw = currentInstance?.fields[field.name];
      fields[field.name] = currentRaw && isEnvironmentValue(currentRaw) ? currentRaw : { dev: '', prod: '' };
    }
    return { ...instance, fields };
  }),
});

/**
 * Resolves one field's plaintext value for the given env. A non-`secret` field (e.g. `call-ai-text`'s
 * `baseUrl`) is stored verbatim and returned as-is, ignoring `env`. A `secret` field is decrypted for
 * the requested env; if `prod` has no value configured and `field.secretProdOptional` is set, falls
 * back to `dev` instead of returning nothing (see ADR 0006's "dev/prod credential separation", relaxed
 * for vendors like a single shared API key). Used by the internal credential resolver (runner-facing)
 * and the authenticated models-listing endpoint (editor-facing) — never exposes ciphertext either way.
 */
export const resolveFieldValue = (
  instance: IIntegrationInstance,
  field: IFieldConfig,
  env: 'dev' | 'prod',
  encryptionKey: Buffer,
): string | undefined => {
  const raw = instance.fields[field.name];
  if (field.kind !== 'secret') {
    if (typeof raw === 'string') return raw;
    return;
  }
  if (!raw || !isEnvironmentValue(raw)) return;
  let encrypted = raw[env];
  if (!encrypted && env === 'prod' && field.secretProdOptional) encrypted = raw.dev;
  if (!encrypted) return;
  return decryptSecret(encrypted, encryptionKey);
};
