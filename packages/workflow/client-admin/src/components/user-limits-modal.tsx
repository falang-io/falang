import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Form, InputNumber, Modal, message } from 'antd';
import { adminApi, type IUserLimits, type IUserLimitsOverrides, type IUserLimitsResponse } from '../admin-api.js';

type TFieldKey = keyof IUserLimits;

const FIELD_KEYS: readonly TFieldKey[] = [
  'maxProjectFilesBytes',
  'maxFileBytes',
  'devFileTtlHours',
  'ingressFileTtlHours',
  'maxConcurrentProdVersions',
];

type IFormValues = Partial<Record<TFieldKey, number>>;

export interface IUserLimitsModalProps {
  /** `null` closes the modal; a user id opens it for that user. */
  readonly userId: string | null;
  readonly onClose: () => void;
}

/**
 * `GET`/`PUT /admin/users/:id/limits` — five `InputNumber` fields (empty = "use the env default",
 * placeholder shows the current effective default), Save (writes exactly what's shown — a filled
 * field becomes an override, an empty one explicitly clears it) and Reset (clears every override
 * in one call). See ADR 0038 (private) §2.
 */
export const UserLimitsModal: React.FC<IUserLimitsModalProps> = ({ userId, onClose }) => {
  const t = getGlobalI18n().t;
  const [form] = Form.useForm<IFormValues>();
  const [data, setData] = useState<IUserLimitsResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setData(null);
      form.resetFields();
      return;
    }
    let cancelled = false;
    setLoading(true);
    adminApi
      .getUserLimits(userId)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        form.setFieldsValue({ ...response.overrides });
      })
      .catch((error) => {
        message.error(
          error instanceof Error ? error.message : t('workflow-client-admin:user-limits-modal.load-failed'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line exhaustive-deps -- `form`/`t` are stable; re-run only when the target user changes.
  }, [userId]);

  const submit = async (overrides: IUserLimitsOverrides): Promise<void> => {
    if (!userId) return;
    setSaving(true);
    try {
      const response = await adminApi.updateUserLimits(userId, overrides);
      setData(response);
      form.setFieldsValue({ ...response.overrides });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('workflow-client-admin:user-limits-modal.save-failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const values = await form.validateFields();
    const overrides: IUserLimitsOverrides = {};
    for (const key of FIELD_KEYS) {
      const value = values[key];
      overrides[key] = typeof value === 'number' ? value : null;
    }
    await submit(overrides);
  };

  const handleReset = async (): Promise<void> => {
    const overrides: IUserLimitsOverrides = {};
    for (const key of FIELD_KEYS) overrides[key] = null;
    await submit(overrides);
  };

  return (
    <Modal
      title={t('workflow-client-admin:user-limits-modal.title')}
      open={userId !== null}
      onCancel={onClose}
      footer={[
        <Button key="reset" danger loading={isSaving} onClick={handleReset}>
          {t('workflow-client-admin:user-limits-modal.reset')}
        </Button>,
        <Button key="cancel" onClick={onClose}>
          {t('workflow-client-admin:user-limits-modal.cancel')}
        </Button>,
        <Button key="save" type="primary" loading={isSaving} onClick={handleSave}>
          {t('workflow-client-admin:user-limits-modal.save')}
        </Button>,
      ]}
    >
      <Form<IFormValues> form={form} layout="vertical" disabled={isLoading}>
        <Form.Item
          name="maxProjectFilesBytes"
          label={t('workflow-client-admin:user-limits-modal.max-project-files-bytes-label')}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            placeholder={String(data?.effective.maxProjectFilesBytes ?? '')}
          />
        </Form.Item>
        <Form.Item name="maxFileBytes" label={t('workflow-client-admin:user-limits-modal.max-file-bytes-label')}>
          <InputNumber style={{ width: '100%' }} min={1} placeholder={String(data?.effective.maxFileBytes ?? '')} />
        </Form.Item>
        <Form.Item name="devFileTtlHours" label={t('workflow-client-admin:user-limits-modal.dev-file-ttl-hours-label')}>
          <InputNumber style={{ width: '100%' }} min={1} placeholder={String(data?.effective.devFileTtlHours ?? '')} />
        </Form.Item>
        <Form.Item
          name="ingressFileTtlHours"
          label={t('workflow-client-admin:user-limits-modal.ingress-file-ttl-hours-label')}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            placeholder={String(data?.effective.ingressFileTtlHours ?? '')}
          />
        </Form.Item>
        <Form.Item
          name="maxConcurrentProdVersions"
          label={t('workflow-client-admin:user-limits-modal.max-concurrent-prod-versions-label')}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            placeholder={String(data?.effective.maxConcurrentProdVersions ?? '')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
