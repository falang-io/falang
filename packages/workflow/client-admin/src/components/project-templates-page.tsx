import type React from 'react';
import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi, type IApiProject } from '@falang/workflow-client-common';
import { Button, Form, Input, Modal, Popconfirm, Select, Table, Tag, message } from 'antd';
import { adminApi, type IAdminProjectTemplate } from '../admin-api.js';

const T = 'workflow-client-admin:project-templates-page';

interface ICreateValues {
  name: string;
  description: string;
  sourceProjectId: string;
}

const errorText = (error: unknown, fallbackKey: string): string =>
  error instanceof Error ? error.message : getGlobalI18n().t(`${T}.${fallbackKey}`);

/** Local, per-mount MobX store for `ProjectTemplatesPage` (same shape as `UsersPageStore`). */
class ProjectTemplatesPageStore {
  readonly templates = observable<IAdminProjectTemplate>([]);
  readonly myProjects = observable<IApiProject>([]);
  @observable isLoading = true;

  constructor() {
    makeObservable(this);
    this.load();
    this.loadProjects();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    try {
      const templates = await adminApi.listProjectTemplates();
      runInAction(() => {
        this.templates.replace(templates);
        this.isLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      message.error(errorText(error, 'load-failed'));
    }
  }

  async loadProjects(): Promise<void> {
    try {
      const projects = await workflowApi.listProjects();
      runInAction(() => this.myProjects.replace(projects));
    } catch (error) {
      message.error(errorText(error, 'projects-load-failed'));
    }
  }

  /** Runs one mutation, then reloads the table; returns whether it succeeded. */
  async mutate(fn: () => Promise<unknown>, failedKey: string): Promise<boolean> {
    try {
      await fn();
      await this.load();
      return true;
    } catch (error) {
      message.error(errorText(error, failedKey));
      return false;
    }
  }
}

const downloadJson = (payload: unknown, fileName: string): void => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const ProjectTemplatesPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new ProjectTemplatesPageStore());
  const [form] = Form.useForm<ICreateValues>();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState<IAdminProjectTemplate | null>(null);
  const [refreshSource, setRefreshSource] = useState<string | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const projectOptions = store.myProjects.map((project) => ({ value: project.id, label: project.name }));

  const closeCreate = () => {
    setCreateOpen(false);
    form.resetFields();
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    const ok = await store.mutate(
      () => adminApi.createProjectTemplate({ ...values, description: values.description ?? '' }),
      'save-failed',
    );
    setSaving(false);
    if (ok) closeCreate();
  };

  const handleRefresh = async () => {
    if (!refreshing || !refreshSource) return;
    setSaving(true);
    const ok = await store.mutate(() => adminApi.refreshProjectTemplate(refreshing.id, refreshSource), 'save-failed');
    setSaving(false);
    if (ok) {
      setRefreshing(null);
      setRefreshSource(null);
    }
  };

  const handleFileChosen = async (file: File | undefined) => {
    const id = uploadTarget.current;
    if (uploadInput.current) uploadInput.current.value = '';
    if (!file || !id) return;
    const payload = await file.text().then(
      (text): unknown => JSON.parse(text),
      () => null,
    );
    if (payload === null) {
      message.error(t(`${T}.invalid-json`));
      return;
    }
    await store.mutate(() => adminApi.uploadProjectTemplatePayload(id, payload), 'upload-failed');
  };

  const handleDownload = async (template: IAdminProjectTemplate) => {
    try {
      downloadJson(await adminApi.exportProjectTemplate(template.id), `${template.name}.json`);
    } catch (error) {
      message.error(errorText(error, 'download-failed'));
    }
  };

  return (
    <>
      <Button
        type="primary"
        data-testid="create-template"
        onClick={() => setCreateOpen(true)}
        style={{ marginBottom: 16 }}
      >
        {t(`${T}.create`)}
      </Button>
      <input
        ref={uploadInput}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFileChosen(e.target.files?.[0]);
        }}
      />
      <Table<IAdminProjectTemplate>
        rowKey="id"
        loading={store.isLoading}
        dataSource={store.templates.slice()}
        pagination={false}
        columns={[
          { title: t(`${T}.name-column`), dataIndex: 'name' },
          { title: t(`${T}.description-column`), dataIndex: 'description' },
          {
            title: t(`${T}.enabled-column`),
            dataIndex: 'enabled',
            render: (enabled: boolean) => <Tag color={enabled ? 'green' : 'default'}>{enabled ? 'on' : 'off'}</Tag>,
          },
          { title: t(`${T}.order-column`), dataIndex: 'sortOrder' },
          {
            title: t(`${T}.source-column`),
            dataIndex: 'sourceProjectId',
            render: (id: string | null) => id ?? t(`${T}.not-set`),
          },
          {
            title: t(`${T}.updated-column`),
            dataIndex: 'updatedAt',
            render: (updatedAt: string) => new Date(updatedAt).toLocaleString(),
          },
          {
            title: t(`${T}.actions-column`),
            key: 'actions',
            render: (_, template) => (
              <>
                <Button
                  size="small"
                  style={{ marginRight: 8 }}
                  onClick={() =>
                    store.mutate(
                      () => adminApi.updateProjectTemplate(template.id, { enabled: !template.enabled }),
                      'save-failed',
                    )
                  }
                >
                  {template.enabled ? t(`${T}.disable`) : t(`${T}.enable`)}
                </Button>
                <Button
                  size="small"
                  style={{ marginRight: 8 }}
                  onClick={() => {
                    setRefreshing(template);
                    setRefreshSource(template.sourceProjectId);
                  }}
                >
                  {t(`${T}.refresh`)}
                </Button>
                <Button
                  size="small"
                  style={{ marginRight: 8 }}
                  onClick={() => {
                    uploadTarget.current = template.id;
                    uploadInput.current?.click();
                  }}
                >
                  {t(`${T}.upload`)}
                </Button>
                <Button size="small" style={{ marginRight: 8 }} onClick={() => handleDownload(template)}>
                  {t(`${T}.download`)}
                </Button>
                <Popconfirm
                  title={t(`${T}.delete-title`)}
                  description={t(`${T}.delete-description`, { name: template.name })}
                  okText={t(`${T}.delete`)}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => store.mutate(() => adminApi.deleteProjectTemplate(template.id), 'delete-failed')}
                >
                  <Button danger size="small">
                    {t(`${T}.delete`)}
                  </Button>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />

      <Modal
        title={t(`${T}.modal-title`)}
        open={isCreateOpen}
        onCancel={closeCreate}
        onOk={handleCreate}
        confirmLoading={isSaving}
        okText={t(`${T}.save`)}
        cancelText={t(`${T}.cancel`)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t(`${T}.name-label`)} rules={[{ required: true }]}>
            <Input autoFocus data-testid="template-name" />
          </Form.Item>
          <Form.Item name="description" label={t(`${T}.description-label`)}>
            <Input />
          </Form.Item>
          <Form.Item
            name="sourceProjectId"
            label={t(`${T}.source-label`)}
            rules={[{ required: true }]}
            extra={t(`${T}.source-hint`)}
          >
            <Select
              data-testid="template-source-project"
              options={projectOptions}
              showSearch={{ optionFilterProp: 'label' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={refreshing ? t(`${T}.refresh-title`, { name: refreshing.name }) : ''}
        open={refreshing !== null}
        onCancel={() => setRefreshing(null)}
        onOk={handleRefresh}
        okButtonProps={{ disabled: !refreshSource }}
        confirmLoading={isSaving}
        okText={t(`${T}.refresh`)}
        cancelText={t(`${T}.cancel`)}
      >
        <Select
          style={{ width: '100%' }}
          value={refreshSource}
          onChange={setRefreshSource}
          options={projectOptions}
          showSearch={{ optionFilterProp: 'label' }}
        />
      </Modal>
    </>
  );
});
