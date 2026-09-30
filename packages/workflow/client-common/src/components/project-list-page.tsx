import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { Badge, Button, Empty, Input, List, Modal, Popconfirm, Segmented, Spin, Typography } from 'antd';
import type { IApiProjectExport } from '../api-client.js';
import { authStore } from '../auth-store.js';
import { navigationStore } from '../navigation-store.js';
import { ProjectListStore } from '../project-list-store.js';
import { sortExtensionNavItems, useClientExtensions } from '../extensions/client-extensions.js';
import { TasksStore } from '../tasks-store.js';
import { LanguageSwitcher } from './language-switcher.js';
import { ChangePasswordModal } from './change-password-modal.js';
import { DefaultPasswordBanner } from './default-password-banner.js';
import { PersonalAccessTokensModal } from './personal-access-tokens-modal.js';
import { TopBar } from './top-bar.js';
import { SupportButton } from './support-button.js';

type TCreateMode = 'empty' | 'file';

const parseExportFile = async (file: File): Promise<IApiProjectExport | null> => {
  try {
    return JSON.parse(await file.text()) as IApiProjectExport;
  } catch {
    return null;
  }
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e2e',
    overflow: 'auto',
  },
  content: { width: 480, maxWidth: '100%', padding: '32px 0', margin: '0 auto' },
  item: { cursor: 'pointer', color: '#cdd6f4' },
  meta: { color: '#6c7086' },
  modeSwitch: { marginBottom: 16 },
  spacedTop: { marginTop: 16 },
  fileHint: { display: 'block', marginTop: 8 },
};

const renderProjectList = (store: ProjectListStore, t: TFunction): React.ReactNode => {
  if (store.isLoading) return <Spin />;
  if (store.projects.length === 0) return <Empty description={t('client:project-list-page.no-projects')} />;
  return (
    <List
      dataSource={store.sortedProjects}
      renderItem={(project) => (
        <List.Item
          style={styles.item}
          onClick={() => navigationStore.selectProject(project.id, project.name)}
          actions={[
            <Popconfirm
              key="delete"
              title={t('client:project-list-page.delete-title')}
              description={t('client:project-list-page.delete-description', { name: project.name })}
              okText={t('client:project-list-page.delete')}
              okButtonProps={{ danger: true }}
              onConfirm={async (e) => {
                e?.stopPropagation();
                await store.deleteProject(project.id);
              }}
              onCancel={(e) => e?.stopPropagation()}
            >
              <Button
                danger
                type="text"
                size="small"
                loading={store.deletingId === project.id}
                onClick={(e) => e.stopPropagation()}
              >
                {t('client:project-list-page.delete')}
              </Button>
            </Popconfirm>,
          ]}
        >
          <List.Item.Meta
            title={<span style={{ color: '#cdd6f4' }}>{project.name}</span>}
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
  const extensions = useClientExtensions();
  const [store] = useState(() => new ProjectListStore());
  // Only used for the "Tasks" button's open-count badge below — the Tasks page itself owns its own
  // `TasksStore` instance, see `TasksPage`.
  const [tasksStore] = useState(() => new TasksStore());
  useEffect(() => {
    tasksStore.load({ status: 'open' });
    return () => tasksStore.dispose();
  }, [tasksStore]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isTokensModalOpen, setTokensModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createMode, setCreateMode] = useState<TCreateMode>('empty');
  const [importPayload, setImportPayload] = useState<IApiProjectExport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const resetModal = () => {
    setModalOpen(false);
    setNewProjectName('');
    setCreateMode('empty');
    setImportPayload(null);
    setImportError(null);
  };

  const handleCreate = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const project = await store.createProject(name);
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
      <TopBar title={t('client:project-list-page.title')}>
        <LanguageSwitcher />
        {authStore.currentUser && extensions.renderPlanBadge?.(authStore.currentUser)}
        <Button type="text" onClick={() => navigationStore.goToRuns()}>
          {t('client:project-list-page.runs')}
        </Button>
        <Badge count={tasksStore.openCount} size="small" offset={[-4, 4]}>
          <Button type="text" onClick={() => navigationStore.goToTasks()}>
            {t('client:project-list-page.tasks')}
          </Button>
        </Badge>
        {sortExtensionNavItems(extensions.navItems).map((item) => (
          <Button key={item.key} type="text" icon={item.icon} onClick={() => navigationStore.goToExtension(item.key)}>
            {item.label}
          </Button>
        ))}
        <SupportButton />
        <Button type="text" onClick={() => setTokensModalOpen(true)}>
          {t('client:project-list-page.tokens')}
        </Button>
        {authStore.currentUser?.role === 'admin' && (
          <Button type="text" href="/admin">
            {t('client:project-list-page.admin')}
          </Button>
        )}
        <Button type="text" onClick={() => authStore.setChangePasswordOpen(true)}>
          {t('client:project-list-page.change-password')}
        </Button>
        <Button type="text" onClick={() => authStore.logout()}>
          {t('client:project-list-page.logout')}
        </Button>
        <Button type="text" onClick={() => setModalOpen(true)}>
          {t('client:project-list-page.new-project')}
        </Button>
      </TopBar>
      <DefaultPasswordBanner />
      <div style={styles.content}>
        {renderProjectList(store, t)}

        {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}

        <ChangePasswordModal />
        <PersonalAccessTokensModal
          open={isTokensModalOpen}
          onClose={() => setTokensModalOpen(false)}
          projects={store.projects.slice()}
        />
      </div>

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
            setNewProjectName('');
            setImportPayload(null);
            setImportError(null);
          }}
          options={[
            { label: t('client:project-list-page.mode-empty'), value: 'empty' },
            { label: t('client:project-list-page.mode-file'), value: 'file' },
          ]}
        />
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
