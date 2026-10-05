import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Badge, Button, Layout, Menu, Typography } from 'antd';
import {
  AppstoreAddOutlined,
  CustomerServiceOutlined,
  GlobalOutlined,
  KeyOutlined,
  RobotOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  authStore,
  ChangePasswordModal,
  DefaultPasswordBanner,
  LanguageSwitcher,
  TopBar,
} from '@falang/workflow-client-common';
import { findAdminExtensionPage, toAdminExtensionPage, useAdminExtensions } from '../admin-extensions.js';
import { adminSupportStore } from '../admin-support-store.js';
import { adminNavigationStore, type TAdminPage } from '../admin-navigation-store.js';
import { AgentSettingsPage } from './agent-settings-page.js';
import { ProxySettingsPage } from './proxy-settings-page.js';
import { OAuthCredentialsPage } from './oauth-credentials-page.js';
import { ProjectTemplatesPage } from './project-templates-page.js';
import { SupportPage } from './support-page.js';
import { UsersPage } from './users-page.js';

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100vh' },
  username: { color: '#a6adc8', marginRight: 8 },
  content: { padding: 24, overflow: 'auto' },
};

const PAGES: readonly { readonly key: TAdminPage; readonly icon: React.ReactNode }[] = [
  { key: 'users', icon: <TeamOutlined /> },
  { key: 'oauth-credentials', icon: <KeyOutlined /> },
  { key: 'agent-settings', icon: <RobotOutlined /> },
  { key: 'proxy', icon: <GlobalOutlined /> },
  { key: 'project-templates', icon: <AppstoreAddOutlined /> },
  { key: 'support', icon: <CustomerServiceOutlined /> },
];

const MENU_LABEL_KEYS: Record<TAdminPage, string> = {
  users: 'shell.users-menu',
  'oauth-credentials': 'shell.oauth-credentials-menu',
  'agent-settings': 'shell.agent-settings-menu',
  proxy: 'shell.proxy-menu',
  'project-templates': 'shell.project-templates-menu',
  support: 'shell.support-menu',
};

/** The admin app's shell — `Sider` menu (users / OAuth credentials) plus a header, no router, see ADR 0030 (private). */
export const AdminShell: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const extensions = useAdminExtensions();
  const extensionPage = findAdminExtensionPage(extensions, adminNavigationStore.page);

  // The unread badge on the "Support" menu entry: polled every 15s for as long as the shell is mounted.
  useEffect(() => {
    adminSupportStore.startUnreadPolling();
    return () => adminSupportStore.stopUnreadPolling();
  }, []);

  return (
    <Layout style={styles.root}>
      <TopBar title={t('workflow-client-admin:shell.title')}>
        <Typography.Text style={styles.username}>{authStore.currentUser?.username}</Typography.Text>
        <LanguageSwitcher />
        <Button type="text" href="/">
          {t('workflow-client-admin:shell.back-to-app')}
        </Button>
        <Button type="text" onClick={() => authStore.setChangePasswordOpen(true)}>
          {t('workflow-client-admin:shell.change-password')}
        </Button>
        <Button type="text" onClick={() => authStore.logout()}>
          {t('workflow-client-admin:shell.logout')}
        </Button>
      </TopBar>
      <Layout>
        <Layout.Sider theme="dark" width={220}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[adminNavigationStore.page]}
            onSelect={({ key }) => adminNavigationStore.setPage(key as TAdminPage)}
            items={[
              ...PAGES.map(({ key, icon }) => ({
                key,
                icon,
                label:
                  key === 'support' ? (
                    <Badge count={adminSupportStore.unreadTotal} size="small" offset={[10, 0]}>
                      <span style={{ color: 'inherit' }}>{t(`workflow-client-admin:${MENU_LABEL_KEYS[key]}`)}</span>
                    </Badge>
                  ) : (
                    t(`workflow-client-admin:${MENU_LABEL_KEYS[key]}`)
                  ),
              })),
              ...(extensions.pages ?? []).map((page) => ({
                key: toAdminExtensionPage(page.key),
                icon: page.icon,
                label: page.label,
              })),
            ]}
          />
        </Layout.Sider>
        <Layout.Content style={styles.content}>
          <DefaultPasswordBanner />
          {adminNavigationStore.page === 'users' ? <UsersPage /> : null}
          {adminNavigationStore.page === 'oauth-credentials' ? <OAuthCredentialsPage /> : null}
          {adminNavigationStore.page === 'agent-settings' ? <AgentSettingsPage /> : null}
          {adminNavigationStore.page === 'proxy' ? <ProxySettingsPage /> : null}
          {adminNavigationStore.page === 'project-templates' ? <ProjectTemplatesPage /> : null}
          {adminNavigationStore.page === 'support' ? <SupportPage /> : null}
          {extensionPage?.render()}
        </Layout.Content>
      </Layout>
      <ChangePasswordModal />
    </Layout>
  );
});
