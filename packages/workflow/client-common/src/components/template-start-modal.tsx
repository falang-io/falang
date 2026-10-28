import { getGlobalI18n } from '@falang/scheme';
import { Alert, Input, Modal, Spin, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { workflowApi } from '../api-client.js';
import type { IApiProjectTemplate } from '../api-types.js';
import { navigationStore } from '../navigation-store.js';
import type { ProjectListStore } from '../project-list-store.js';

interface ITemplateStartModalProps {
  /** The template's id or slug, from `#/templates/<key>`. */
  readonly templateKey: string;
  readonly store: ProjectListStore;
}

/**
 * "Create a project from template" — opened by `#/templates/<key>` (the public site's "Open in Falang"):
 * loads the template, lets the user name the project (the template's name by default) and opens it.
 */
export const TemplateStartModal: React.FC<ITemplateStartModalProps> = observer(({ templateKey, store }) => {
  const t = getGlobalI18n().t;
  const [template, setTemplate] = useState<IApiProjectTemplate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTemplate(null);
    setNotFound(false);
    workflowApi
      .getProjectTemplate(templateKey)
      .then((loaded) => {
        if (cancelled) return;
        setTemplate(loaded);
        setName(loaded.name);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [templateKey]);

  const handleCreate = async () => {
    const projectName = name.trim();
    if (!template || !projectName) return;
    const project = await store.createProjectFromTemplate(template.id, projectName);
    if (project) navigationStore.selectProject(project.id, project.name);
  };

  return (
    <Modal
      open
      title={t('client:template-start.title')}
      onCancel={() => navigationStore.closeTemplate()}
      onOk={notFound ? () => navigationStore.closeTemplate() : handleCreate}
      okText={notFound ? t('client:template-start.close') : t('client:project-list-page.create')}
      okButtonProps={{ disabled: !notFound && (!template || !name.trim()), 'data-testid': 'template-start-create' }}
      cancelButtonProps={notFound ? { style: { display: 'none' } } : {}}
      confirmLoading={store.isCreating}
    >
      <div data-testid="template-start-modal">
        {notFound && <Alert type="warning" showIcon message={t('client:template-start.not-found')} />}
        {!notFound && !template && <Spin />}
        {template && (
          <>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {template.name}
            </Typography.Title>
            {template.description && (
              <Typography.Paragraph type="secondary">{template.description}</Typography.Paragraph>
            )}
            <Typography.Text>{t('client:template-start.name-label')}</Typography.Text>
            <Input
              data-testid="template-start-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onPressEnter={handleCreate}
            />
            {store.error && <Alert style={{ marginTop: 12 }} type="error" message={store.error} />}
          </>
        )}
      </div>
    </Modal>
  );
});
