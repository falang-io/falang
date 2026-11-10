// oxlint-disable max-lines -- one page: its store, the settings form, the models table and the "Load from provider" picker.
import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { useAiProviderName } from '@falang/workflow-client-common';
import { Button, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography, message } from 'antd';
import {
  adminApi,
  type IAdminAiProviderSettings,
  type IAdminUpstreamModel,
  type TAdminAiProviderModelKind,
} from '../admin-api.js';
import {
  addUpstreamModels,
  emptyModelRow,
  guessModelKind,
  rowsToModels,
  toModelRows,
  type IAiProviderModelRow,
} from './ai-provider-models-model.js';

const NS = 'workflow-client-admin:ai-provider-page';
const KINDS: readonly TAdminAiProviderModelKind[] = ['chat', 'image', 'transcribe'];

interface IFormValues {
  baseUrl: string;
  apiKey: string;
}

const errorText = (error: unknown, fallbackKey: string): string =>
  error instanceof Error ? error.message : getGlobalI18n().t(`${NS}.${fallbackKey}`);

/** A local, per-mount MobX store for `AiProviderSettingsPage` (mirrors `AgentSettingsPageStore`). */
class AiProviderSettingsPageStore {
  @observable.ref settings: IAdminAiProviderSettings | null = null;
  @observable.ref rows: IAiProviderModelRow[] = [];
  @observable isLoading = true;
  @observable isSaving = false;
  @observable isDeleting = false;
  @observable isFetching = false;
  /** The upstream `/models` answer while the picker is open, else `null`. */
  @observable.ref upstream: readonly IAdminUpstreamModel[] | null = null;

  constructor() {
    makeObservable(this);
    this.load();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    try {
      const settings = await adminApi.getAiProviderSettings();
      this.apply(settings);
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      message.error(errorText(error, 'load-failed'));
    }
  }

  @action private apply(settings: IAdminAiProviderSettings): void {
    this.settings = settings;
    this.rows = toModelRows(settings.models);
    this.isLoading = false;
  }

  @action setRows(rows: IAiProviderModelRow[]): void {
    this.rows = rows;
  }

  @action updateRow(key: string, patch: Partial<Omit<IAiProviderModelRow, 'key'>>): void {
    this.rows = this.rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
  }

  @action removeRow(key: string): void {
    this.rows = this.rows.filter((row) => row.key !== key);
  }

  @action addRow(): void {
    this.rows = [...this.rows, emptyModelRow()];
  }

  @action async save(input: { baseUrl: string; apiKey?: string }): Promise<boolean> {
    this.isSaving = true;
    try {
      const settings = await adminApi.upsertAiProviderSettings({ ...input, models: rowsToModels(this.rows) });
      runInAction(() => {
        this.isSaving = false;
      });
      this.apply(settings);
      return true;
    } catch (error) {
      runInAction(() => {
        this.isSaving = false;
      });
      message.error(errorText(error, 'save-failed'));
      return false;
    }
  }

  @action async remove(): Promise<void> {
    this.isDeleting = true;
    try {
      await adminApi.deleteAiProviderSettings();
      await this.load();
    } catch (error) {
      message.error(errorText(error, 'delete-failed'));
    }
    runInAction(() => {
      this.isDeleting = false;
    });
  }

  @action async fetchUpstream(input: { baseUrl?: string; apiKey?: string }): Promise<void> {
    this.isFetching = true;
    try {
      const { models } = await adminApi.fetchAiProviderModels(input);
      runInAction(() => {
        this.upstream = models;
      });
    } catch (error) {
      message.error(errorText(error, 'fetch-failed'));
    }
    runInAction(() => {
      this.isFetching = false;
    });
  }

  @action closePicker(): void {
    this.upstream = null;
  }
}

/** "Load from provider": the upstream model ids, a kind per selected id (guessed from the name), "Add". */
const UpstreamModelsPicker: React.FC<{ store: AiProviderSettingsPageStore }> = observer(({ store }) => {
  const t = getGlobalI18n().t;
  const [selected, setSelected] = useState<string[]>([]);
  const [kinds, setKinds] = useState<Record<string, TAdminAiProviderModelKind>>({});
  const upstream = store.upstream;
  const kindOf = (id: string): TAdminAiProviderModelKind => kinds[id] ?? guessModelKind(id);

  const add = () => {
    let rows = store.rows;
    for (const kind of KINDS) {
      rows = addUpstreamModels(
        rows,
        selected.filter((id) => kindOf(id) === kind),
        kind,
      );
    }
    store.setRows(rows);
    setSelected([]);
    store.closePicker();
  };

  return (
    <Modal
      title={t(`${NS}.picker-title`)}
      open={upstream !== null}
      onCancel={() => store.closePicker()}
      onOk={add}
      okText={t(`${NS}.picker-add`)}
      okButtonProps={{ disabled: selected.length === 0, 'data-testid': 'ai-provider-picker-add' } as never}
      width={640}
      destroyOnHidden
    >
      <div data-testid="ai-provider-picker">
        <Table<IAdminUpstreamModel>
          rowKey="id"
          size="small"
          dataSource={[...(upstream ?? [])]}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys.map(String)) }}
          columns={[
            { title: t(`${NS}.model-id`), dataIndex: 'id' },
            { title: t(`${NS}.owned-by`), dataIndex: 'ownedBy', width: 140 },
            {
              title: t(`${NS}.model-kind`),
              key: 'kind',
              width: 160,
              render: (_, model) => (
                <Select<TAdminAiProviderModelKind>
                  size="small"
                  style={{ width: '100%' }}
                  value={kindOf(model.id)}
                  onChange={(kind) => setKinds({ ...kinds, [model.id]: kind })}
                  options={KINDS.map((kind) => ({ value: kind, label: t(`${NS}.kind-${kind}`) }))}
                />
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
});

/** The models table: id, label, kind per row; add/remove rows. Saved together with the form. */
const ModelsTable: React.FC<{ store: AiProviderSettingsPageStore }> = observer(({ store }) => {
  const t = getGlobalI18n().t;
  return (
    <Table<IAiProviderModelRow>
      data-testid="ai-provider-models"
      rowKey="key"
      size="small"
      pagination={false}
      dataSource={store.rows}
      locale={{ emptyText: t(`${NS}.models-empty`) }}
      columns={[
        {
          title: t(`${NS}.model-id`),
          key: 'id',
          render: (_, row, index) => (
            <Input
              data-testid={`ai-provider-model-id-${index}`}
              value={row.id}
              placeholder="gpt-4o-mini"
              onChange={(event) => store.updateRow(row.key, { id: event.target.value })}
            />
          ),
        },
        {
          title: t(`${NS}.model-label`),
          key: 'label',
          render: (_, row, index) => (
            <Input
              data-testid={`ai-provider-model-label-${index}`}
              value={row.label}
              placeholder={t(`${NS}.model-label-placeholder`)}
              onChange={(event) => store.updateRow(row.key, { label: event.target.value })}
            />
          ),
        },
        {
          title: t(`${NS}.model-kind`),
          key: 'kind',
          width: 170,
          render: (_, row, index) => (
            <Select<TAdminAiProviderModelKind>
              data-testid={`ai-provider-model-kind-${index}`}
              style={{ width: '100%' }}
              value={row.kind}
              onChange={(kind) => store.updateRow(row.key, { kind })}
              options={KINDS.map((kind) => ({ value: kind, label: t(`${NS}.kind-${kind}`) }))}
            />
          ),
        },
        {
          title: '',
          key: 'remove',
          width: 90,
          render: (_, row, index) => (
            <Button
              data-testid={`ai-provider-model-remove-${index}`}
              size="small"
              danger
              onClick={() => store.removeRow(row.key)}
            >
              {t(`${NS}.remove-model`)}
            </Button>
          ),
        },
      ]}
    />
  );
});

/**
 * Admin page "Built-in provider" (ADR 0081 (private)): the OpenAI-compatible endpoint, key and model list that
 * workflow OpenAI integrations can run on without a key of their own. Modelled on `AgentSettingsPage`.
 */
export const AiProviderSettingsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const name = useAiProviderName();
  const [store] = useState(() => new AiProviderSettingsPageStore());
  const [form] = Form.useForm<IFormValues>();
  const settings = store.settings;

  // Same as `AgentSettingsPage`: sync the form whenever fresh settings arrive; the key is never round-tripped.
  useEffect(() => {
    if (settings) form.setFieldsValue({ baseUrl: settings.baseUrl ?? '', apiKey: '' });
    // oxlint-disable-next-line exhaustive-deps -- `form` is a stable antd form instance.
  }, [settings]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const apiKey = values.apiKey.trim();
    // oxlint-disable-next-line no-undefined -- an omitted key keeps the stored one.
    const saved = await store.save({ baseUrl: values.baseUrl.trim(), apiKey: apiKey || undefined });
    if (saved) {
      form.setFieldValue('apiKey', '');
      message.success(t(`${NS}.saved`));
    }
  };

  const handleFetch = () => {
    const values = form.getFieldsValue();
    store.fetchUpstream({ baseUrl: (values.baseUrl ?? '').trim(), apiKey: (values.apiKey ?? '').trim() }).catch(() => {
      // reported by the store
    });
  };

  return (
    <div style={{ maxWidth: 820 }} data-testid="ai-provider-page">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {name}
      </Typography.Title>
      <Typography.Paragraph>{t(`${NS}.description`)}</Typography.Paragraph>
      <div style={{ marginBottom: 16 }} data-testid="ai-provider-status">
        {settings?.configured ? (
          <Tag color="green">{t(`${NS}.configured`)}</Tag>
        ) : (
          <Tag color="default">{t(`${NS}.not-configured`)}</Tag>
        )}
        {settings?.updatedAt ? (
          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
            {t(`${NS}.updated-at`, { date: new Date(settings.updatedAt).toLocaleString() })}
          </Typography.Text>
        ) : null}
      </div>
      <Form<IFormValues>
        form={form}
        layout="vertical"
        disabled={store.isLoading}
        style={{ maxWidth: 480 }}
        initialValues={{ baseUrl: settings?.baseUrl ?? '', apiKey: '' }}
      >
        <Form.Item name="baseUrl" label={t(`${NS}.base-url-label`)} rules={[{ required: true }]}>
          <Input data-testid="ai-provider-base-url" placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label={t(`${NS}.api-key-label`)}
          rules={[{ required: !settings?.hasApiKey }]}
          // oxlint-disable-next-line no-undefined -- antd's `extra` treats `undefined` as "no hint", unlike `''`.
          extra={settings?.hasApiKey ? t(`${NS}.api-key-extra`) : undefined}
        >
          <Input.Password data-testid="ai-provider-api-key" autoComplete="new-password" />
        </Form.Item>
      </Form>
      <Typography.Title level={5}>{t(`${NS}.models-title`)}</Typography.Title>
      <Typography.Paragraph type="secondary">{t(`${NS}.models-description`)}</Typography.Paragraph>
      <ModelsTable store={store} />
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 24px' }}>
        <Button data-testid="ai-provider-add-model" onClick={() => store.addRow()} disabled={store.isLoading}>
          {t(`${NS}.add-model`)}
        </Button>
        <Button
          data-testid="ai-provider-load-models"
          loading={store.isFetching}
          disabled={store.isLoading}
          onClick={handleFetch}
        >
          {t(`${NS}.load-models`)}
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          type="primary"
          data-testid="ai-provider-save"
          loading={store.isSaving}
          disabled={store.isLoading}
          onClick={() => {
            handleSave().catch(() => {
              // validation errors are shown by the form
            });
          }}
        >
          {t(`${NS}.save`)}
        </Button>
        {settings?.baseUrl ? (
          <Popconfirm
            title={t(`${NS}.reset-title`)}
            description={t(`${NS}.reset-description`)}
            okText={t(`${NS}.reset`)}
            okButtonProps={{ danger: true }}
            onConfirm={() => store.remove()}
          >
            <Button danger data-testid="ai-provider-reset" loading={store.isDeleting}>
              {t(`${NS}.reset`)}
            </Button>
          </Popconfirm>
        ) : null}
      </div>
      <UpstreamModelsPicker store={store} />
    </div>
  );
});
