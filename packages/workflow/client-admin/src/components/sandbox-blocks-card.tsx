import type React from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Card, Popconfirm, Table, Typography } from 'antd';
import type { IAdminSandboxBlock } from '../admin-api.js';
import type { SandboxBotsPageStore } from './sandbox-bots-page.js';
import { platformDisplayName } from './sandbox-bots-payload.js';

/** The accounts the test bot is blocked for (abuse protection), with an "Unblock" action. */
export const SandboxBlocksCard: React.FC<{ readonly store: SandboxBotsPageStore }> = observer(({ store }) => {
  const t = getGlobalI18n().t;
  const key = (name: string) => t(`workflow-client-admin:sandbox-bots-page.${name}`);
  return (
    <Card data-testid="sandbox-bot-blocks" title={key('blocks-title')} style={{ marginBottom: 16 }}>
      {store.limits ? (
        <Typography.Paragraph type="secondary">
          {t('workflow-client-admin:sandbox-bots-page.blocks-description', {
            limit: store.limits.unreachablePerHour,
            messages: store.limits.messagesPerHour,
          })}
        </Typography.Paragraph>
      ) : null}
      <Table<IAdminSandboxBlock>
        size="small"
        rowKey="id"
        pagination={false}
        loading={store.isLoading}
        dataSource={[...store.blocks]}
        locale={{ emptyText: key('blocks-empty') }}
        onRow={() => ({ 'data-testid': 'sandbox-bot-block-row' }) as React.HTMLAttributes<HTMLElement>}
        columns={[
          {
            title: key('blocks-user'),
            key: 'user',
            render: (_, block) => block.username ?? block.email ?? block.userId,
          },
          { title: key('blocks-platform'), key: 'vendor', render: (_, block) => platformDisplayName(block.vendor) },
          {
            title: key('blocks-reason'),
            key: 'reason',
            render: (_, block) =>
              t(`workflow-client-admin:sandbox-bots-page.blocks-reason-${block.reason}`, {
                defaultValue: block.reason,
              }),
          },
          {
            title: key('blocks-since'),
            key: 'createdAt',
            render: (_, block) => new Date(block.createdAt).toLocaleString(),
          },
          {
            key: 'actions',
            render: (_, block) => (
              <Popconfirm
                title={key('unblock-title')}
                okText={key('unblock')}
                onConfirm={() => store.unblock(block.id)}
              >
                <Button size="small" data-testid="sandbox-bot-unblock" loading={store.busyBlockId === block.id}>
                  {key('unblock')}
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </Card>
  );
});
