import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Badge, Button, Tooltip } from 'antd';
import { CarryOutOutlined, FolderOpenOutlined, PlayCircleOutlined, SafetyOutlined } from '@ant-design/icons';
import { authStore } from '../auth-store.js';
import { navigationStore } from '../navigation-store.js';
import { sortExtensionNavItems, toExtensionViewName, useClientExtensions } from '../extensions/client-extensions.js';
import { TasksStore } from '../tasks-store.js';
import { UserMenu } from './user-menu.js';

/** The product mark (`/icon.png`, served by both the community and the cloud client). */
const LOGO_URL = '/icon.png';

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 16px',
    height: 52,
    background: '#181825',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  brand: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: '#cdd6f4',
    flexShrink: 0,
  },
  logo: { width: 26, height: 26, display: 'block' },
  brandName: { fontSize: 17, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap' },
  spacer: { flex: 1 },
  nav: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap', minWidth: 0 },
};

/** A top-bar item's look; `active` marks the section the user is in. Shared by the app header and the project toolbar. */
export const navButtonStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 34,
  padding: '0 10px',
  borderRadius: 6,
  color: active ? '#cdd6f4' : '#a6adc8',
  background: active ? '#313244' : 'transparent',
  boxShadow: active ? 'inset 0 -2px 0 #89b4fa' : 'none',
  fontWeight: active ? 600 : 400,
});

export interface IFalangBrandProps {
  /** The logo alone (the project toolbar), or the logo with the product name (the app header). */
  readonly compact?: boolean;
}

/** The Falang logo (and "FalangFlow"), a link back to the project list. */
export const FalangBrand: React.FC<IFalangBrandProps> = ({ compact }) => {
  const t = getGlobalI18n().t;
  const button = (
    <button
      type="button"
      style={styles.brand}
      aria-label={t('client:app-header.home')}
      data-testid="falang-brand"
      onClick={() => navigationStore.goToProjectList()}
    >
      <img src={LOGO_URL} alt="" style={styles.logo} />
      {!compact && <span style={styles.brandName}>FalangFlow</span>}
    </button>
  );
  return compact ? <Tooltip title={t('client:app-header.home')}>{button}</Tooltip> : button;
};

interface INavButtonProps {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly testId: string;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly children: React.ReactNode;
}

const NavButton: React.FC<INavButtonProps> = ({ active, icon, testId, onClick, href, children }) => (
  <Button
    type="text"
    style={navButtonStyle(active)}
    data-testid={testId}
    {...(active ? { 'data-active': 'true', 'aria-current': 'page' as const } : {})}
    icon={icon}
    onClick={onClick}
    href={href}
  >
    {children}
  </Button>
);

/**
 * The top menu of every page outside a project: the brand on the left; on the right, left to right — Projects,
 * Admin (admins only), Runs, Tasks, the host's extension items (cloud: the balance) and the user menu. The current
 * section is highlighted.
 */
export const AppHeader: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const extensions = useClientExtensions();
  // Only for the "Tasks" item's open-count badge — the Tasks page owns its own `TasksStore`.
  const [tasksStore] = useState(() => new TasksStore());
  useEffect(() => {
    tasksStore.load({ status: 'open' });
    return () => tasksStore.dispose();
  }, [tasksStore]);

  const view = navigationStore.view;
  const user = authStore.currentUser;
  return (
    <header style={styles.root} data-testid="app-header">
      <FalangBrand />
      <span style={styles.spacer} />
      <nav style={styles.nav}>
        <NavButton
          active={view === 'projects'}
          icon={<FolderOpenOutlined />}
          testId="nav-projects"
          onClick={() => navigationStore.goToProjectList()}
        >
          {t('client:app-header.projects')}
        </NavButton>
        {user?.role === 'admin' && (
          <NavButton active={false} icon={<SafetyOutlined />} testId="nav-admin" href="/admin">
            {t('client:app-header.admin')}
          </NavButton>
        )}
        <NavButton
          active={view === 'runs'}
          icon={<PlayCircleOutlined />}
          testId="nav-runs"
          onClick={() => navigationStore.goToRuns()}
        >
          {t('client:app-header.runs')}
        </NavButton>
        <NavButton
          active={view === 'tasks'}
          icon={<CarryOutOutlined />}
          testId="nav-tasks"
          onClick={() => navigationStore.goToTasks()}
        >
          {t('client:app-header.tasks')}
          {tasksStore.openCount > 0 && <Badge count={tasksStore.openCount} size="small" />}
        </NavButton>
        {sortExtensionNavItems(extensions.navItems).map((item) => (
          <NavButton
            key={item.key}
            active={view === toExtensionViewName(item.key)}
            icon={item.render ? null : item.icon}
            testId={`nav-ext-${item.key}`}
            onClick={() => navigationStore.goToExtension(item.key)}
          >
            {item.render ? item.render() : item.label}
          </NavButton>
        ))}
        {user && extensions.renderPlanBadge?.(user)}
        <UserMenu style={navButtonStyle(view === 'settings' || view === 'tokens')} />
      </nav>
    </header>
  );
});
