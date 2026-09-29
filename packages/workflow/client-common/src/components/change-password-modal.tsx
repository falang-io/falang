import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Form, Input, Modal, Typography, message } from 'antd';
import { authStore } from '../auth-store.js';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * "Change password" for the signed-in user — opened via `authStore.setChangePasswordOpen(true)` from
 * the user-menu buttons and the default-password banner, and mounted once per app shell
 * (`ProjectListPage`, the admin shell).
 */
export const ChangePasswordModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [form] = Form.useForm<FormValues>();
  const [isSaving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const close = () => {
    form.resetFields();
    setErrorMessage(null);
    authStore.setChangePasswordOpen(false);
  };

  const submit = async (values: FormValues) => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await authStore.changePassword(values.currentPassword, values.newPassword);
      message.success(t('client:change-password-modal.success'));
      close();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('client:change-password-modal.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('client:change-password-modal.title')}
      open={authStore.isChangePasswordOpen}
      onOk={() => form.submit()}
      onCancel={close}
      okText={t('client:change-password-modal.save')}
      cancelText={t('client:change-password-modal.cancel')}
      confirmLoading={isSaving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} disabled={isSaving}>
        <Form.Item
          label={t('client:change-password-modal.current')}
          name="currentPassword"
          rules={[{ required: true }]}
        >
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item
          label={t('client:change-password-modal.new')}
          name="newPassword"
          rules={[{ required: true }, { min: 8, message: t('client:change-password-modal.too-short') }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label={t('client:change-password-modal.confirm')}
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) =>
                !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('client:change-password-modal.mismatch'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}
      </Form>
    </Modal>
  );
});
