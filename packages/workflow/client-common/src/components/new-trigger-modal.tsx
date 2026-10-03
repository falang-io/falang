import type React from 'react';
import { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Form, Input, Modal, Select } from 'antd';
import type { IFieldConfig, IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import {
  previewNextFireTimes,
  SCHEDULE_CRON_EXPRESSION_FIELD_NAME,
  SCHEDULE_CRON_TIMEZONE_FIELD_NAME,
  SCHEDULE_CRON_TRIGGER_NAME,
  SCHEDULE_INTERVAL_TRIGGER_NAME,
  SCHEDULE_INTERVAL_UNIT_FIELD_NAME,
} from '@falang/workflow-integrations-schedule';
import { useWorkflowStore } from '../workflow-store-context.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { buildTriggerCredentialOptions } from './trigger-credential.js';
import { validateDocumentName } from '../document-names.js';
import { CronBuilderField } from './cron-builder-field.js';

/** A sensible starting point once "cron" is picked — "once an hour" (also what `react-js-cron`'s own `@hourly` shortcut produces), not presumptuous about weekdays/time-of-day. */
const DEFAULT_CRON_EXPRESSION = '0 * * * *';
const DEFAULT_INTERVAL_UNIT = 'minutes';

interface FormValues {
  name: string;
  /** `ITriggerCredentialOption.key` — the vendor and credential id are derived from it. */
  credential: string;
  triggerName: string;
  contextFields?: Record<string, string>;
}

export interface INewTriggerData {
  vendor: string;
  triggerName: string;
  credentialId: string;
  triggerConfig?: Record<string, string>;
}

interface NewTriggerModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, data: INewTriggerData) => void;
}

/**
 * "New trigger" creation form — unlike Function/Folder/Object (a single name input, see
 * `ProjectTree`), a trigger needs an integration/trigger-type/credential picked up front, since
 * `trigger-function-body`'s data is fixed at creation (see `WorkflowStore.createTriggerFunctionDocument`).
 */
export const NewTriggerModal: React.FC<NewTriggerModalProps> = observer(({ open, onClose, onCreate }) => {
  const i18n = getGlobalI18n();
  const t = i18n.t;
  const store = useWorkflowStore();
  const [form] = Form.useForm<FormValues>();
  const credentialKey = Form.useWatch('credential', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ name: '', credential: '', triggerName: '' });
  }, [open, form]);

  const options = useMemo(
    () =>
      buildTriggerCredentialOptions(
        REGISTERED_INTEGRATIONS,
        ((store.integrationsDocument?.customData as IIntegrationsDocumentData | undefined)?.instances ?? []).map(
          (instance) => instance,
        ),
      ),
    [store.integrationsDocument?.customData],
  );
  const selected = useMemo(
    () => [...options.instances, ...options.withoutCredentials].find((option) => option.key === credentialKey),
    [options, credentialKey],
  );
  const integration = useMemo(
    () => REGISTERED_INTEGRATIONS.find((item) => item.vendor === selected?.vendor),
    [selected],
  );
  const vendorLabel = (vendor: string): string => {
    const found = REGISTERED_INTEGRATIONS.find((item) => item.vendor === vendor);
    return found ? t(found.label) : vendor;
  };
  const selectOptions = [
    {
      label: t('client:new-trigger-modal.group-credentials'),
      options: options.instances.map((option) => ({
        value: option.key,
        label: `${option.instanceName} (${vendorLabel(option.vendor)})`,
      })),
    },
    {
      label: t('client:new-trigger-modal.group-no-credentials'),
      options: options.withoutCredentials.map((option) => ({ value: option.key, label: vendorLabel(option.vendor) })),
    },
  ].filter((group) => group.options.length > 0);

  // Preselect the vendor's first instance (never overwrites a choice already made).
  useEffect(() => {
    if (!open || implicitCredentialId !== null || instances.length === 0) return;
    if (!form.getFieldValue('credentialId')) form.setFieldsValue({ credentialId: instances[0].id });
  }, [open, implicitCredentialId, instances, form]);

  const triggerName = Form.useWatch('triggerName', form);
  const trigger = useMemo(
    () => integration?.triggers.find((item) => item.name === triggerName),
    [integration, triggerName],
  );

  const handleCredentialChange = () => {
    form.setFieldsValue({ triggerName: '', contextFields: {} });
  };

  const handleTriggerChange = (nextTriggerName: string) => {
    // Seed sensible defaults for the two schedule triggers (ADR 0037 (private)
    // §2/§7) — every other vendor's contextFields still just reset to blank, unchanged from before.
    const defaults: Record<string, string> = {};
    if (nextTriggerName === SCHEDULE_CRON_TRIGGER_NAME) {
      defaults[SCHEDULE_CRON_EXPRESSION_FIELD_NAME] = DEFAULT_CRON_EXPRESSION;
      defaults[SCHEDULE_CRON_TIMEZONE_FIELD_NAME] = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else if (nextTriggerName === SCHEDULE_INTERVAL_TRIGGER_NAME) {
      defaults[SCHEDULE_INTERVAL_UNIT_FIELD_NAME] = DEFAULT_INTERVAL_UNIT;
    }
    form.setFieldsValue({ contextFields: defaults });
  };

  // Recomputed on every contextFields keystroke (ADR 0037 (private) §7's "live
  // 'next 3 fire times' preview") — `previewNextFireTimes` itself validates the whole config and
  // throws on anything incomplete/invalid, so an in-progress edit just shows nothing rather than a
  // second, redundant error message (the same one is already shown under the invalid field itself via
  // each contextField's own `validate` rule below).
  const contextFieldsValues = Form.useWatch('contextFields', form) as Record<string, string> | undefined;
  const firePreviewDates = useMemo(() => {
    if (trigger?.name !== SCHEDULE_INTERVAL_TRIGGER_NAME && trigger?.name !== SCHEDULE_CRON_TRIGGER_NAME) return null;
    try {
      return previewNextFireTimes(trigger.name, contextFieldsValues ?? {});
    } catch {
      return null;
    }
  }, [trigger, contextFieldsValues]);

  /** Renders one `contextFields` entry's input control — pulled out of the JSX below to avoid a nested ternary (schedule-cron's `expression` field gets the cron builder, everything else keeps the plain `select`/`text` rendering). */
  const renderContextFieldInput = (field: IFieldConfig): React.ReactNode => {
    if (trigger?.name === SCHEDULE_CRON_TRIGGER_NAME && field.name === SCHEDULE_CRON_EXPRESSION_FIELD_NAME) {
      return (
        <CronBuilderField
          language={i18n.language}
          customHint={t('client:new-trigger-modal.cron-builder-custom-hint')}
        />
      );
    }
    if (field.kind === 'select') {
      return (
        <Select
          options={(field.options ?? []).map((option) => ({ value: option.value, label: t(option.label) }))}
          placeholder={t(field.label)}
        />
      );
    }
    return <Input placeholder={t(field.label)} />;
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const triggerConfig = trigger?.contextFields?.length
      ? Object.fromEntries(trigger.contextFields.map((field) => [field.name, values.contextFields?.[field.name] ?? '']))
      : null;
    if (!selected) return;
    onCreate(values.name, {
      vendor: selected.vendor,
      triggerName: values.triggerName,
      credentialId: selected.credentialId,
      ...(triggerConfig ? { triggerConfig } : {}),
    });
    onClose();
  };

  return (
    <Modal
      title={t('client:new-trigger-modal.title')}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      destroyOnHidden
      okText={t('client:new-trigger-modal.create')}
    >
      {selectOptions.length === 0 ? (
        <Alert type="warning" message={t('client:new-trigger-modal.no-credentials-hint')} />
      ) : (
        <Form<FormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('client:new-trigger-modal.name-label')}
            rules={[
              { required: true, message: t('client:new-trigger-modal.name-required') },
              {
                validator: (_rule, value: string) => {
                  const error = value ? validateDocumentName(store.documents, 'trigger-function', value) : null;
                  if (error === 'invalid-function-name')
                    return Promise.reject(new Error(t('client:new-trigger-modal.name-invalid')));
                  if (error === 'taken') return Promise.reject(new Error(t('client:new-trigger-modal.name-taken')));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input autoFocus placeholder={t('client:new-trigger-modal.name-placeholder')} />
          </Form.Item>
          <Form.Item
            name="credential"
            label={t('client:new-trigger-modal.credential-label')}
            rules={[{ required: true, message: t('client:new-trigger-modal.credential-required') }]}
            extra={options.instances.length === 0 ? t('client:new-trigger-modal.no-credentials') : null}
          >
            <Select
              options={selectOptions}
              placeholder={t('client:new-trigger-modal.credential-placeholder')}
              onChange={handleCredentialChange}
            />
          </Form.Item>
          <Form.Item
            name="triggerName"
            label={t('client:new-trigger-modal.trigger-type-label')}
            rules={[{ required: true, message: t('client:new-trigger-modal.trigger-type-required') }]}
          >
            <Select
              options={(integration?.triggers ?? []).map((item) => ({ value: item.name, label: t(item.label) }))}
              placeholder={t('client:new-trigger-modal.trigger-type-placeholder')}
              disabled={!integration}
              onChange={handleTriggerChange}
            />
          </Form.Item>
          {(trigger?.contextFields ?? []).map((field) => (
            <Form.Item
              key={field.name}
              name={['contextFields', field.name]}
              label={t(field.label)}
              rules={[
                { required: true, message: t('client:new-trigger-modal.field-required', { label: t(field.label) }) },
                ...(field.validate
                  ? [
                      {
                        validator: (_rule: unknown, value: string) => {
                          const error = field.validate?.(value ?? '');
                          return error ? Promise.reject(new Error(error)) : Promise.resolve();
                        },
                      },
                    ]
                  : []),
              ]}
            >
              {renderContextFieldInput(field)}
            </Form.Item>
          ))}
          {firePreviewDates && firePreviewDates.length > 0 && (
            <div className="new-trigger-modal__fire-preview">
              <div className="new-trigger-modal__fire-preview-label">
                {t('client:new-trigger-modal.next-fire-times-label')}
              </div>
              <ul>
                {firePreviewDates.map((date, index) => {
                  // Cron fires are shown in the configured timezone (§7); interval fires have no
                  // timezone field at all, so they fall back to the browser's own local zone — `[]`
                  // for the locales argument means the same as an omitted one (runtime default).
                  const timeZone =
                    trigger?.name === SCHEDULE_CRON_TRIGGER_NAME
                      ? (contextFieldsValues?.[SCHEDULE_CRON_TIMEZONE_FIELD_NAME] ?? '')
                      : '';
                  return <li key={index}>{date.toLocaleString([], timeZone ? { timeZone } : {})}</li>;
                })}
              </ul>
            </div>
          )}
        </Form>
      )}
    </Modal>
  );
});
