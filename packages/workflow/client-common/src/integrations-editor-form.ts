import {
  SECRET_MASK,
  type IEnvironmentValue,
  type IFieldConfig,
  type IIntegrationInstance,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';

export interface IIntegrationFormValues {
  name: string;
  vendor: string;
  [fieldKey: string]: string;
}

const isEnvironmentValue = (value: IEnvironmentValue | string): value is IEnvironmentValue => typeof value === 'object';

/** `dev`/`prod` secret fields need two form inputs per credential field — see ADR 0006's "Dev/prod credential separation". */
export const fieldKey = (field: IFieldConfig, env?: 'dev' | 'prod'): string =>
  env ? `field__${field.name}__${env}` : `field__${field.name}`;

export const instanceToFormValues = (
  instance: IIntegrationInstance,
  integration: IWorkflowIntegration,
): IIntegrationFormValues => {
  const values: IIntegrationFormValues = { name: instance.name, vendor: instance.vendor };
  for (const field of integration.credentialFields) {
    const raw = instance.fields[field.name];
    if (field.kind === 'secret') {
      const envValue = raw && isEnvironmentValue(raw) ? raw : { dev: '', prod: '' };
      values[fieldKey(field, 'dev')] = envValue.dev;
      values[fieldKey(field, 'prod')] = envValue.prod;
    } else {
      values[fieldKey(field)] = typeof raw === 'string' ? raw : '';
    }
  }
  return values;
};

/**
 * `previousInstance` carries a `hidden` field's value forward unchanged — a hidden field (e.g. an
 * OAuth2 token, written only by the backend's callback) has no rendered `Form.Item`, so `values`
 * never has an entry for it; without this, every save (even one that only renames the credential)
 * would silently wipe it back to empty. See ADR 0015 (private).
 */
export const formValuesToFields = (
  integration: IWorkflowIntegration,
  values: IIntegrationFormValues,
  previousInstance: IIntegrationInstance | undefined,
): Record<string, IEnvironmentValue | string> => {
  const fields: Record<string, IEnvironmentValue | string> = {};
  for (const field of integration.credentialFields) {
    if (field.hidden) {
      fields[field.name] =
        previousInstance?.fields[field.name] ?? (field.kind === 'secret' ? { dev: '', prod: '' } : '');
      continue;
    }
    fields[field.name] =
      field.kind === 'secret'
        ? { dev: values[fieldKey(field, 'dev')] ?? '', prod: values[fieldKey(field, 'prod')] ?? '' }
        : (values[fieldKey(field)] ?? '');
  }
  return fields;
};

/** An OAuth2 credential is "Connected" once its (backend-written) `access_token` field masks to `SECRET_MASK`. */
export const isOAuth2Connected = (instance: IIntegrationInstance | undefined): boolean => {
  const raw = instance?.fields['access_token'];
  return typeof raw === 'object' && raw.dev === SECRET_MASK;
};

/**
 * The "Name" field of a new integration follows the picked vendor: it takes the vendor's display name while it is
 * empty or still equal to the name filled in automatically for the previous vendor; a name the user typed is kept.
 */
export const nameForPickedVendor = (
  currentName: string,
  previousAutoName: string | null,
  vendorName: string,
): string => (currentName.trim() === '' || currentName === previousAutoName ? vendorName : currentName);
