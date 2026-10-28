import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { Button, Empty, Input, List, Modal, Segmented, Select, Spin, Typography } from 'antd';
import type { IApiProjectExport } from '../api-client.js';
import { DeleteProjectButton, isOwned, renderRoleTags } from './project-list-item-parts.js';
import { navigationStore } from '../navigation-store.js';
import { ProjectListStore } from '../project-list-store.js';
import { EmailNotVerifiedBanner, WelcomeBanner } from './default-password-banner.js';
import { TemplateStartModal } from './template-start-modal.js';
import { readPendingTemplate } from '../pending-template.js';
import { StartWithAgent, useStartWithAgent, type TStartWithAgent } from './start-with-agent.js';

type TCreateMode = 'empty' | 'file';

const parseExportFile = async (file: File): Promise<IApiProjectExport | null> => {
  try {
    return JSON.parse(await file.text()) as IApiProjectExport;
  } catch {
    return null;
  }
};

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column' },
  content: { width: 560, maxWidth: '100%', padding: '32px 16px', margin: '0 auto', boxSizing: 'border-box' },
  heading: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 },
  title: { color: '#cdd6f4', margin: 0 },
  item: { cursor: 'pointer', color: '#cdd6f4' },
  meta: { color: '#6c7086' },
  modeSwitch: { marginBottom: 16 },
  spacedTop: { marginTop: 16 },
  fileHint: { display: 'block', marginTop: 8 },
  newProject: { fontWeight: 600 },
};

const renderProjectList = (store: ProjectListStore, t: TFunction, startWithAgent: TStartWithAgent): React.ReactNode => {
  if (store.isLoading) return <Spin />;
  if (store.projects.length === 0) {
    if (startWithAgent === 'loading') return <Spin />;
    if (startWithAgent) return <StartWithAgent onStart={startWithAgent} busy={store.isCreating} />;
    return <Empty description={t('client:project-list-page.no-projects')} />;
  }
  return (
    <List
      dataSource={store.sortedProjects}
      renderItem={(project) => (
        <List.Item
          style={styles.item}
          onClick={() => navigationStore.selectProject(project.id, project.name)}
          actions={isOwned(project) ? [<DeleteProjectButton key="delete" store={store} project={project} t={t} />] : []}
        >
          <List.Item.Meta
            title={
              <span style={{ color: '#cdd6f4' }}>
                {project.name} {renderRoleTags(project, t)}
              </span>
            }
            description={
              <span style={styles.meta}>{new Date(project.lastEditedAt ?? project.createdAt).toLocaleString()}</span>
            }
          />
        </List.Item>
      )}
    />
  );
};

export const ProjectListPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new ProjectListStore());
  const [isModalOpen, setModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createMode, setCreateMode] = useState<TCreateMode>('empty');
  const [importPayload, setImportPayload] = useState<IApiProjectExport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const startWithAgent = useStartWithAgent(store);
  // A template picked on the site before signing up (the confirmation link opens without the hash).
  useEffect(() => {
    const pending = readPendingTemplate();
    if (pending && !navigationStore.templateKey) navigationStore.openTemplate(pending);
  }, []);

  const resetModal = () => {
    setModalOpen(false);
    setNewProjectName('');
    setCreateMode('empty');
    setImportPayload(null);
    setImportError(null);
    setTemplateId(null);
  };

  const handleCreate = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const project = templateId
      ? await store.createProjectFromTemplate(templateId, name)
      : await store.createProject(name);
    if (project) {
      resetModal();
      navigationStore.selectProject(project.id, project.name);
    }
  };

  const handleFileSelected = async (file: File | null) => {
    setImportError(null);
    setImportPayload(null);
    if (!file) return;
    const payload = await parseExportFile(file);
    if (!payload) {
      setImportError(t('client:project-list-page.invalid-json'));
      return;
    }
    // Pre-fills the name field from the exported project so the user can see what they picked,
    // while still being free to rename it before importing — see `handleImport`, which always
    // imports under whatever is currently in the field, not the file's original name.
    setImportPayload(payload);
    setNewProjectName(payload.project.name);
  };

  const handleImport = async () => {
    const name = newProjectName.trim();
    if (!importPayload || !name) return;
    const project = await store.importProject({ ...importPayload, project: { ...importPayload.project, name } });
    if (project) {
      resetModal();
      navigationStore.selectProject(project.id, project.name);
    } else {
      setImportError(store.error);
    }
  };

  return (
    <div style={styles.root}>
      <WelcomeBanner />
      <EmailNotVerifiedBanner />
      <div style={styles.content}>
        <div style={styles.heading}>
          <Typography.Title level={3} style={styles.title}>
            {t('client:project-list-page.title')}
          </Typography.Title>
          <Button type="primary" style={styles.newProject} onClick={() => setModalOpen(true)}>
            {t('client:project-list-page.new-project')}
          </Button>
        </div>
        {renderProjectList(store, t, startWithAgent)}

        {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}
      </div>

      {navigationStore.templateKey && (
        <TemplateStartModal key={navigationStore.templateKey} templateKey={navigationStore.templateKey} store={store} />
      )}
      <Modal
        title={t('client:project-list-page.modal-title')}
        open={isModalOpen}
        onOk={createMode === 'empty' ? handleCreate : handleImport}
        onCancel={resetModal}
        confirmLoading={store.isCreating}
        okButtonProps={{
          disabled: createMode === 'empty' ? !newProjectName.trim() : !importPayload || !newProjectName.trim(),
        }}
        okText={createMode === 'empty' ? t('client:project-list-page.create') : t('client:project-list-page.import')}
      >
        <Segmented
          style={styles.modeSwitch}
          block
          value={createMode}
          onChange={(value) => {
            setCreateMode(value as TCreateMode);
            setTemplateId(null);
            setNewProjectName('');
            setImportPayload(null);
            setImportError(null);
          }}
          options={[
            { label: t('client:project-list-page.mode-empty'), value: 'empty' },
            { label: t('client:project-list-page.mode-file'), value: 'file' },
          ]}
        />
        {createMode === 'empty' && store.templates.length > 0 && (
          <div data-testid="project-template-select" style={{ marginBottom: 16 }}>
            <Select
              style={{ width: '100%' }}
              placeholder={t('client:project-list-page.template-placeholder')}
              allowClear
              value={templateId}
              onChange={(value: string | undefined) => setTemplateId(value ?? null)}
              options={store.templates.map((template) => ({
                value: template.id,
                label: template.name,
              }))}
            />
          </div>
        )}
        {createMode === 'file' && (
          <>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                handleFileSelected(e.target.files?.[0] ?? null);
              }}
            />
            <Typography.Text type="secondary" style={styles.fileHint}>
              {t('client:project-list-page.file-hint')}
            </Typography.Text>
          </>
        )}
        <Input
          autoFocus
          style={createMode === 'file' ? styles.spacedTop : {}}
          placeholder={t('client:project-list-page.name-placeholder')}
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onPressEnter={createMode === 'empty' ? handleCreate : handleImport}
        />
        {importError && (
          <Typography.Text type="danger" style={styles.fileHint}>
            {importError}
          </Typography.Text>
        )}
      </Modal>
    </div>
  );
});
