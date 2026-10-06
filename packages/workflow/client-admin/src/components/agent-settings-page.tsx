import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Form, Input, Popconfirm, Select, Tag, Typography, message } from 'antd';
import { adminApi, type IAdminAgentSettings } from '../admin-api.js';

interface IFormValues {
  baseUrl: string;
  model: string;
  apiKey: string;
  interface: 'json' | 'nodes';
}

/** Mirrors `OAuthCredentialsPageStore` — a local, per-mount MobX store for `AgentSettingsPage`. */
class AgentSettingsPageStore {
  @observable.ref settings: IAdminAgentSettings | null = null;
  @observable isLoading = true;
  @observable isSaving = false;
  @observable isDeleting = false;

  constructor() {
    makeObservable(this);
    this.load();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    try {
      const settings = await adminApi.getAgentSettings();
      runInAction(() => {
        this.settings = settings;
        this.isLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:agent-settings-page.load-failed'),
      );
    }
  }

  @action async save(input: { baseUrl: string; model: string; apiKey?: string; interface: 'json' | 'nodes' }): Promise<boolean> {
    this.isSaving = true;
    try {
      const settings = await adminApi.upsertAgentSettings(input);
      runInAction(() => {
        this.settings = settings;
        this.isSaving = false;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.isSaving = false;
      });
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:agent-settings-page.save-failed'),
      );
      return false;
    }
  }

  @action async remove(): Promise<void> {
    this.isDeleting = true;
    try {
      await adminApi.deleteAgentSettings();
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.isDeleting = false;
      });
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:agent-settings-page.delete-failed'),
      );
      return;
    }
    runInAction(() => {
      this.isDeleting = false;
    });
  }
}

export const AgentSettingsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new AgentSettingsPageStore());
  const [form] = Form.useForm<IFormValues>();

  const settings = store.settings;

  // The form mounts before the initial `load()` resolves, so `initialValues` alone can't populate
  // it — sync fields whenever fresh settings arrive from the server (initial load, after save, or
  // after a reset). The API key is deliberately never round-tripped back into the field.
  useEffect(() => {
    if (settings) {
      form.setFieldsValue({ baseUrl: settings.baseUrl ?? '', model: settings.model ?? '', apiKey: '', interface: settings.interface });
    }
    // oxlint-disable-next-line exhaustive-deps -- `form` is a stable antd form instance.
  }, [settings]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const saved = await store.save({
      baseUrl: values.baseUrl,
      model: values.model,
      interface: values.interface,
      // oxlint-disable-next-line no-undefined -- `apiKey` must be omitted (not sent as `''`) to keep the stored key.
      apiKey: values.apiKey || undefined,
    });
    if (saved) form.setFieldValue('apiKey', '');
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <Typography.Paragraph>{t('workflow-client-admin:agent-settings-page.description')}</Typography.Paragraph>
      <div style={{ marginBottom: 16 }}>
        {settings?.configured ? (
          <Tag color="green">{t('workflow-client-admin:agent-settings-page.configured')}</Tag>
        ) : (
          <Tag color="default">{t('workflow-client-admin:agent-settings-page.not-configured')}</Tag>
        )}
        {settings?.updatedAt ? (
          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
            {t('workflow-client-admin:agent-settings-page.updated-at', {
              date: new Date(settings.updatedAt).toLocaleString(),
            })}
          </Typography.Text>
        ) : null}
      </div>
      <Form<IFormValues>
        form={form}
        layout="vertical"
        disabled={store.isLoading}
        initialValues={{ baseUrl: settings?.baseUrl ?? '', model: settings?.model ?? '', apiKey: '', interface: settings?.interface ?? 'json' }}
      >
        <Form.Item
          name="baseUrl"
          label={t('workflow-client-admin:agent-settings-page.base-url-label')}
          rules={[{ required: true }]}
        >
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item
          name="model"
          label={t('workflow-client-admin:agent-settings-page.model-label')}
          rules={[{ required: true }]}
        >
          <Input placeholder="gpt-4o-mini" />
        </Form.Item>
        <Form.Item name="interface" label={t('workflow-client-admin:agent-settings-page.interface-label')}>
          <Select
            options={[
              { value: 'json', label: t('workflow-client-admin:agent-settings-page.interface-json') },
              { value: 'nodes', label: t('workflow-client-admin:agent-settings-page.interface-nodes') },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label={t('workflow-client-admin:agent-settings-page.api-key-label')}
          rules={[{ required: !settings?.configured }]}
          // oxlint-disable-next-line no-undefined -- antd's `extra` prop treats `undefined` as "no hint", unlike `''`.
          extra={settings?.configured ? t('workflow-client-admin:agent-settings-page.api-key-extra') : undefined}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" loading={store.isSaving} onClick={handleSave}>
            {t('workflow-client-admin:agent-settings-page.save')}
          </Button>
          {settings?.configured ? (
            <Popconfirm
              title={t('workflow-client-admin:agent-settings-page.reset-title')}
              description={t('workflow-client-admin:agent-settings-page.reset-description')}
              okText={t('workflow-client-admin:agent-settings-page.reset')}
              okButtonProps={{ danger: true }}
              onConfirm={() => store.remove()}
            >
              <Button danger loading={store.isDeleting} style={{ marginLeft: 8 }}>
                {t('workflow-client-admin:agent-settings-page.reset')}
              </Button>
            </Popconfirm>
          ) : null}
        </Form.Item>
      </Form>
    </div>
  );
});
