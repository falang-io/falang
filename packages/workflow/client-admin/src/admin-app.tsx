import type React from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { ConfigProvider, Result, Spin, theme as antdTheme } from 'antd';
import { authStore, LoginPage } from '@falang/workflow-client-common';
import { AdminExtensionsProvider, type IAdminExtensions } from './admin-extensions.js';
import { AdminShell } from './components/admin-shell.js';
import './locales/register-admin-locales.js';

const styles: Record<string, React.CSSProperties> = {
  loading: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e1e2e',
  },
};

/**
 * The admin sub-app's root component — served from `admin.html`/`admin-main.tsx` in
 * `@falang/workflow-client`, at the `/admin` path. Auth is shared with the main client (same
 * origin, same token, same `AuthStore`/`LoginPage`) — see
 * ADR 0030 (private). `extensions` adds pages/sections (`IAdminExtensions`); without it the app is unchanged.
 */
export const AdminApp: React.FC<{ extensions?: IAdminExtensions }> = observer(({ extensions }) => {
  const t = getGlobalI18n().t;

  const content = (() => {
    if (!authStore.isAuthChecked) {
      return (
        <div style={styles.loading}>
          <Spin />
        </div>
      );
    }
    if (!authStore.currentUser) return <LoginPage />;
    if (authStore.currentUser.role !== 'admin') {
      return (
        <div style={styles.loading}>
          <Result
            status="403"
            title={t('workflow-client-admin:forbidden.title')}
            subTitle={t('workflow-client-admin:forbidden.subtitle')}
            extra={<a href="/">{t('workflow-client-admin:forbidden.back')}</a>}
          />
        </div>
      );
    }
    return <AdminShell />;
  })();

  return (
    <ConfigProvider theme={{ algorithm: antdTheme.darkAlgorithm }}>
      <AdminExtensionsProvider extensions={extensions}>{content}</AdminExtensionsProvider>
    </ConfigProvider>
  );
});
