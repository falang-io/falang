import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Popconfirm, Table, Tag, Typography, message } from 'antd';
import { EyeOutlined, SwapOutlined, TeamOutlined } from '@ant-design/icons';
import { ProjectMembersModal } from '@falang/workflow-client-common';
import { adminApi, type IAdminUserProject } from '../admin-api.js';
import { TransferProjectModal } from './transfer-project-modal.js';

/** The main client's hash route for a project — the admin app lives at `/admin` on the same origin. */
export const projectViewUrl = (projectId: string): string => `/#/projects/${encodeURIComponent(projectId)}`;

/**
 * A user's projects in the "Details" modal. "Open" shows the project in the main client in a new tab — read-only for
 * an admin who isn't the owner (the backend allows an admin GET routes only, see `TProjectAccess`). "Users" manages the
 * project's members (ADR 0070 (private)) — an admin may add users to any project; "Transfer" hands it to another
 * user (it then leaves this list).
 */
export const UserProjects: React.FC<{ userId: string }> = ({ userId }) => {
  const t = getGlobalI18n().t;
  const label = (key: string) => t(`workflow-client-admin:users-page.${key}`);
  const [projects, setProjects] = useState<IAdminUserProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [membersProjectId, setMembersProjectId] = useState<string | null>(null);
  const [transferProject, setTransferProject] = useState<IAdminUserProject | null>(null);

  const toggleSuspension = (project: IAdminUserProject): void => {
    setBusyId(project.id);
    (project.suspendedReason ? adminApi.resumeProject(project.id) : adminApi.suspendProject(project.id))
      .then(() => setReloadKey((key) => key + 1))
      .catch((error_: unknown) => message.error(error_ instanceof Error ? error_.message : label('suspend-failed')))
      .finally(() => setBusyId(null));
  };

  useEffect(() => {
    let cancelled = false;
    setProjects(null);
    setError(null);
    adminApi
      .listUserProjects(userId)
      .then((result) => {
        if (!cancelled) setProjects(result);
      })
      .catch((error_: unknown) => {
        if (!cancelled) setError(error_ instanceof Error ? error_.message : label('projects-failed'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reloadKey]);

  return (
    <div data-testid="admin-user-projects">
      <Typography.Title level={5} style={{ marginTop: 16 }}>
        {label('projects-title')}
      </Typography.Title>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      <Table<IAdminUserProject>
        rowKey="id"
        size="small"
        pagination={false}
        loading={projects === null && error === null}
        dataSource={projects ?? []}
        locale={{ emptyText: label('projects-empty') }}
        columns={[
          {
            title: label('project-name-column'),
            dataIndex: 'name',
            render: (name: string, project) => (
              <>
                {name} {project.prodEnabled && <Tag color="green">prod</Tag>}
                {project.suspendedReason && (
                  <Tag color="error" data-testid="admin-project-suspended-tag" data-reason={project.suspendedReason}>
                    {label(`suspended-${project.suspendedReason}`)}
                  </Tag>
                )}
              </>
            ),
          },
          {
            title: label('project-edited-column'),
            dataIndex: 'lastEditedAt',
            render: (value: string | null, project) => new Date(value ?? project.createdAt).toLocaleString(),
          },
          {
            title: '',
            key: 'open',
            width: 470,
            render: (_, project) => (
              <>
                <Popconfirm
                  title={label(project.suspendedReason ? 'resume-confirm' : 'suspend-confirm')}
                  okText={label(project.suspendedReason ? 'resume' : 'suspend')}
                  onConfirm={() => toggleSuspension(project)}
                >
                  <Button
                    size="small"
                    danger={!project.suspendedReason}
                    loading={busyId === project.id}
                    style={{ marginRight: 8 }}
                    data-testid={project.suspendedReason ? 'admin-resume-project' : 'admin-suspend-project'}
                  >
                    {label(project.suspendedReason ? 'resume' : 'suspend')}
                  </Button>
                </Popconfirm>
                <Button
                  size="small"
                  icon={<TeamOutlined />}
                  style={{ marginRight: 8 }}
                  onClick={() => setMembersProjectId(project.id)}
                  data-testid="admin-project-members"
                >
                  {label('project-members')}
                </Button>
                <Button
                  size="small"
                  icon={<SwapOutlined />}
                  style={{ marginRight: 8 }}
                  onClick={() => setTransferProject(project)}
                  data-testid="admin-transfer-project"
                >
                  {label('project-transfer')}
                </Button>
                <a href={projectViewUrl(project.id)} target="_blank" rel="noreferrer" data-testid="admin-open-project">
                  <EyeOutlined /> {label('project-open')}
                </a>
              </>
            ),
          },
        ]}
      />
      {membersProjectId && (
        <ProjectMembersModal projectId={membersProjectId} open onClose={() => setMembersProjectId(null)} />
      )}
      {transferProject && (
        <TransferProjectModal
          project={transferProject}
          onClose={() => setTransferProject(null)}
          onTransferred={() => {
            setTransferProject(null);
            setReloadKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
};
