import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Form, Input, Popconfirm, Select, Tag, Typography, message } from 'antd';
import { adminApi, type IAdminProxySettings, type IAdminProxyVendor } from '../admin-api.js';

import { buildProxySettingsPayload, type IProxyFormValues } from './proxy-settings-payload.js';

/** Local, per-mount MobX store for `ProxySettingsPage` (same shape as the AI agent page's). */
export class ProxySettingsPageStore {
  @observable.ref settings: IAdminProxySettings | null = null;
  @observable.ref vendors: readonly IAdminProxyVendor[] = [];
  @observable isLoading = true;
  @observable isSaving = false;
  @observable isDeleting = false;

  constructor() {
    makeObservable(this);
    this.load();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    const t = getGlobalI18n().t;
    const [settingsResult, vendorsResult] = await Promise.allSettled([
      adminApi.getProxySettings(),
      adminApi.listProxyVendors(),
    ]);
    runInAction(() => {
      if (settingsResult.status === 'fulfilled') this.settings = settingsResult.value;
      if (vendorsResult.status === 'fulfilled') this.vendors = vendorsResult.value.vendors;
      this.isLoading = false;
    });
    // The vendor catalog failing is non-fatal: stored vendor ids are still shown as options.
    if (settingsResult.status === 'rejected') {
      message.error(
        settingsResult.reason instanceof Error
          ? settingsResult.reason.message
          : t('workflow-client-admin:proxy-settings-page.load-failed'),
      );
    }
    if (vendorsResult.status === 'rejected') {
      message.warning(t('workflow-client-admin:proxy-settings-page.vendors-load-failed'));
    }
  }

  @action async save(input: { url: string; token?: string; vendors: string[] }): Promise<boolean> {
    this.isSaving = true;
    try {
      const settings = await adminApi.upsertProxySettings(input);
      runInAction(() => {
        this.settings = settings;
        this.isSaving = false;
      });
      message.success(getGlobalI18n().t('workflow-client-admin:proxy-settings-page.saved'));
      return true;
    } catch (error) {
      runInAction(() => {
        this.isSaving = false;
      });
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:proxy-settings-page.save-failed'),
      );
      return false;
    }
  }

  @action async remove(): Promise<void> {
    this.isDeleting = true;
    try {
      await adminApi.deleteProxySettings();
      await this.load();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:proxy-settings-page.delete-failed'),
      );
    }
    runInAction(() => {
      this.isDeleting = false;
    });
  }
}

export const ProxySettingsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new ProxySettingsPageStore());
  const [form] = Form.useForm<IProxyFormValues>();

  const settings = store.settings;
  const vendors = store.vendors;

  // Sync fields whenever fresh settings arrive; the token is never round-tripped into the field.
  useEffect(() => {
    if (settings) {
      form.setFieldsValue({ url: settings.url ?? '', token: '', vendors: settings.vendors });
    }
    // oxlint-disable-next-line exhaustive-deps -- `form` is a stable antd form instance.
  }, [settings]);

  const options = useMemo(() => {
    const labelOf = (vendor: IAdminProxyVendor): string => {
      if (vendor.source === 'activepieces') return vendor.label;
      const translated = t(vendor.label);
      return translated && translated !== vendor.label ? translated : vendor.vendor;
    };
    const toOption = (vendor: IAdminProxyVendor) => ({ value: vendor.vendor, label: labelOf(vendor) });
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
    const known = new Set(vendors.map((vendor) => vendor.vendor));
    const unknown = (settings?.vendors ?? []).filter((id) => !known.has(id)).map((id) => ({ value: id, label: id }));
    const groups = [
      {
        label: t('workflow-client-admin:proxy-settings-page.group-builtin'),
        options: vendors
          .filter((vendor) => vendor.source === 'builtin')
          .map((vendor) => toOption(vendor))
          .toSorted(byLabel),
      },
      {
        label: t('workflow-client-admin:proxy-settings-page.group-activepieces'),
        options: vendors
          .filter((vendor) => vendor.source === 'activepieces')
          .map((vendor) => toOption(vendor))
          .toSorted(byLabel),
      },
    ].filter((group) => group.options.length > 0);
    return unknown.length > 0 ? [...groups, { label: '?', options: unknown }] : groups;
    // oxlint-disable-next-line exhaustive-deps -- `t` is stable; labels re-derive from the loaded data.
  }, [vendors, settings]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const saved = await store.save(buildProxySettingsPayload({ ...values, token: values.token ?? '' }));
    if (saved) form.setFieldValue('token', '');
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Typography.Paragraph>{t('workflow-client-admin:proxy-settings-page.description')}</Typography.Paragraph>
      <div style={{ marginBottom: 16 }}>
        {settings?.configured ? (
          <Tag color="green">{t('workflow-client-admin:proxy-settings-page.configured')}</Tag>
        ) : (
          <Tag color="default">{t('workflow-client-admin:proxy-settings-page.not-configured')}</Tag>
        )}
        {settings?.updatedAt ? (
          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
            {t('workflow-client-admin:proxy-settings-page.updated-at', {
              date: new Date(settings.updatedAt).toLocaleString(),
            })}
          </Typography.Text>
        ) : null}
      </div>
      <Form<IProxyFormValues>
        form={form}
        layout="vertical"
        disabled={store.isLoading}
        initialValues={{ url: settings?.url ?? '', token: '', vendors: settings?.vendors ?? [] }}
      >
        <Form.Item
          name="url"
          label={t('workflow-client-admin:proxy-settings-page.url-label')}
          rules={[
            { required: true },
            {
              pattern: /^https?:\/\//i,
              message: t('workflow-client-admin:proxy-settings-page.url-invalid'),
            },
          ]}
        >
          <Input placeholder="https://proxy.example.com" />
        </Form.Item>
        <Form.Item
          name="token"
          label={t('workflow-client-admin:proxy-settings-page.token-label')}
          rules={[{ required: !settings?.hasToken }]}
          // oxlint-disable-next-line no-undefined -- antd's `extra` prop treats `undefined` as "no hint", unlike `''`.
          extra={settings?.hasToken ? t('workflow-client-admin:proxy-settings-page.token-extra') : undefined}
        >
          <Input.Password
            autoComplete="new-password"
            // oxlint-disable-next-line no-undefined -- no placeholder when no token is stored.
            placeholder={settings?.hasToken ? '••••••••' : undefined}
          />
        </Form.Item>
        <Form.Item name="vendors" label={t('workflow-client-admin:proxy-settings-page.vendors-label')}>
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            options={options}
            placeholder={t('workflow-client-admin:proxy-settings-page.vendors-placeholder')}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" loading={store.isSaving} onClick={handleSave}>
            {t('workflow-client-admin:proxy-settings-page.save')}
          </Button>
          {settings?.configured ? (
            <Popconfirm
              title={t('workflow-client-admin:proxy-settings-page.reset-title')}
              description={t('workflow-client-admin:proxy-settings-page.reset-description')}
              okText={t('workflow-client-admin:proxy-settings-page.reset')}
              okButtonProps={{ danger: true }}
              onConfirm={() => store.remove()}
            >
              <Button danger loading={store.isDeleting} style={{ marginLeft: 8 }}>
                {t('workflow-client-admin:proxy-settings-page.reset')}
              </Button>
            </Popconfirm>
          ) : null}
        </Form.Item>
      </Form>
    </div>
  );
});
