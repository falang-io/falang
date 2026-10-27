import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Popconfirm, Tag } from 'antd';
import type { TFunction } from '@falang/scheme';
import type { IApiProject } from '../api-client.js';
import type { ProjectListStore } from '../project-list-store.js';

/** Owned projects carry `myRoles: ['owner']`; an older backend sends none, which means "owned" too. */
export const isOwned = (project: IApiProject): boolean => !project.myRoles || project.myRoles.includes('owner');

/** A shared project's role tags (ADR 0070 (private)); nothing for an owned one. */
export const renderRoleTags = (project: IApiProject, t: TFunction): React.ReactNode =>
  isOwned(project)
    ? null
    : project.myRoles?.map((role) => (
        <Tag key={role} color={role === 'editor' ? 'blue' : 'purple'} data-testid={`project-role-${role}`}>
          {t(`client:project-members.role-${role}`)}
        </Tag>
      ));

/** "Delete" in the project list — owned projects only (ADR 0070 (private): deleting is the one owner-only action). */
export const DeleteProjectButton: React.FC<{ store: ProjectListStore; project: IApiProject; t: TFunction }> = observer(
  ({ store, project, t }) => (
    <Popconfirm
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
    </Popconfirm>
  ),
);
