import type React from 'react';
import { useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Collapse, Table, Tag, Typography } from 'antd';
import { splitDuration, sessionDurationMs } from '@falang/workflow-client-common';
import { adminApi, type IAdminRunnerSession } from '../admin-api.js';

const PAGE_SIZE = 100;

/** A collapsed "Instance uptime" section of the user's "Details" modal: the latest runner sessions (ADR 0067 (private)). */
export const UserRunnerSessions: React.FC<{ userId: string }> = ({ userId }) => {
  const t = getGlobalI18n().t;
  const label = (key: string, options?: Record<string, unknown>) =>
    t(`workflow-client-admin:users-page.${key}`, options);
  const [sessions, setSessions] = useState<IAdminRunnerSession[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (before?: string): void => {
    setLoading(true);
    setError(null);
    adminApi
      .listUserRunnerSessions(userId, { limit: PAGE_SIZE, ...(before ? { before } : {}) })
      .then(({ sessions: page }) => {
        setSessions((current) => [...(before ? (current ?? []) : []), ...page]);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : label('sessions-failed')))
      .finally(() => setLoading(false));
  };

  const formatDuration = (session: IAdminRunnerSession): string => {
    const { hours, minutes } = splitDuration(sessionDurationMs(session.startedAt, session.endedAt, Date.now()));
    return label('duration', { hours, minutes });
  };

  const last = sessions?.at(-1);
  return (
    <Collapse
      style={{ marginTop: 16 }}
      size="small"
      data-testid="admin-user-runner-sessions"
      onChange={(keys) => {
        if (keys.length > 0 && sessions === null) load();
      }}
      items={[
        {
          key: 'uptime',
          label: label('sessions-title'),
          children: (
            <>
              {error && <Typography.Text type="danger">{error}</Typography.Text>}
              <Table<IAdminRunnerSession>
                rowKey="id"
                size="small"
                pagination={false}
                loading={loading && sessions === null}
                dataSource={sessions ?? []}
                locale={{ emptyText: label('sessions-empty') }}
                columns={[
                  { title: label('session-project'), dataIndex: 'projectName', render: (v: string | null) => v ?? '—' },
                  { title: label('session-env'), dataIndex: 'env', render: (env: string) => <Tag>{env}</Tag> },
                  { title: label('session-version'), dataIndex: 'buildId', render: (v: string | null) => v ?? '—' },
                  {
                    title: label('session-started'),
                    dataIndex: 'startedAt',
                    render: (v: string) => new Date(v).toLocaleString(),
                  },
                  {
                    title: label('session-ended'),
                    dataIndex: 'endedAt',
                    render: (v: string | null) => (v ? new Date(v).toLocaleString() : label('session-running')),
                  },
                  {
                    title: label('session-duration'),
                    key: 'duration',
                    render: (_, session) => formatDuration(session),
                  },
                  {
                    title: label('session-reason'),
                    dataIndex: 'endReason',
                    render: (v: string | null) => (v ? label(`session-reason-${v}`) : '—'),
                  },
                ]}
              />
              {hasMore && last && (
                <Button size="small" loading={loading} onClick={() => load(last.startedAt)} style={{ marginTop: 8 }}>
                  {label('sessions-more')}
                </Button>
              )}
            </>
          ),
        },
      ]}
    />
  );
};
