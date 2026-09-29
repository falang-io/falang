import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { isValidFunctionName } from '@falang/dto';
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
import { resolveTriggerCredentialId } from './trigger-credential.js';
import { CronBuilderField } from './cron-builder-field.js';

/** A sensible starting point once "cron" is picked — "once an hour" (also what `react-js-cron`'s own `@hourly` shortcut produces), not presumptuous about weekdays/time-of-day. */
const DEFAULT_CRON_EXPRESSION = '0 * * * *';
const DEFAULT_INTERVAL_UNIT = 'minutes';

interface FormValues {
  name: string;
  vendor: string;
  triggerName: string;
  credentialId: string;
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
  const [vendor, setVendor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const firstVendor = REGISTERED_INTEGRATIONS[0]?.vendor ?? null;
    setVendor(firstVendor);
    form.resetFields();
    form.setFieldsValue({ name: '', vendor: firstVendor ?? '', triggerName: '', credentialId: '' });
  }, [open, form]);

  const integration = useMemo(() => REGISTERED_INTEGRATIONS.find((item) => item.vendor === vendor), [vendor]);

  const instances = useMemo(() => {
    const data = store.integrationsDocument?.customData as IIntegrationsDocumentData | undefined;
    return (data?.instances ?? []).filter((item) => item.vendor === vendor);
  }, [store.integrationsDocument?.customData, vendor]);

  // Credential-less vendor (e.g. `schedule`) with no explicit instance in this project yet — the
  // credential step is skipped entirely, `credentialId` becomes the vendor id itself (implicit target,
  // see ADR 0037 (private) §4). `null` means a real instance still has to be
  // picked from `instances` via the Select below, same as before.
  const implicitCredentialId = useMemo(
    () => resolveTriggerCredentialId(integration, instances),
    [integration, instances],
  );

  const triggerName = Form.useWatch('triggerName', form);
  const trigger = useMemo(
    () => integration?.triggers.find((item) => item.name === triggerName),
    [integration, triggerName],
  );

  const handleVendorChange = (nextVendor: string) => {
    setVendor(nextVendor);
    form.setFieldsValue({ triggerName: '', credentialId: '', contextFields: {} });
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
    // When `implicitCredentialId` is set, the credential Form.Item below isn't rendered at all (so
    // `values.credentialId` would be empty) — the vendor id itself is the credential id in that case.
    const credentialId = implicitCredentialId ?? values.credentialId;
    onCreate(values.name, {
      vendor: values.vendor,
      triggerName: values.triggerName,
      credentialId,
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
      {REGISTERED_INTEGRATIONS.length === 0 ? (
        <Alert type="warning" message={t('client:new-trigger-modal.no-integrations')} />
      ) : (
        <Form<FormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('client:new-trigger-modal.name-label')}
            rules={[
              { required: true, message: t('client:new-trigger-modal.name-required') },
              {
                validator: (_rule, value: string) =>
                  !value || isValidFunctionName(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('client:new-trigger-modal.name-invalid'))),
              },
            ]}
          >
            <Input autoFocus placeholder={t('client:new-trigger-modal.name-placeholder')} />
          </Form.Item>
          <Form.Item name="vendor" label={t('client:new-trigger-modal.integration-label')} rules={[{ required: true }]}>
            <Select
              options={REGISTERED_INTEGRATIONS.map((item) => ({ value: item.vendor, label: t(item.label) }))}
              onChange={handleVendorChange}
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
          {implicitCredentialId === null && (
            <Form.Item
              name="credentialId"
              label={t('client:new-trigger-modal.credential-label')}
              rules={[{ required: true, message: t('client:new-trigger-modal.credential-required') }]}
              extra={instances.length === 0 ? t('client:new-trigger-modal.no-credentials') : null}
            >
              <Select
                options={instances.map((instance) => ({ value: instance.id, label: instance.name }))}
                placeholder={t('client:new-trigger-modal.credential-placeholder')}
                disabled={instances.length === 0}
              />
            </Form.Item>
          )}
        </Form>
      )}
    </Modal>
  );
});
