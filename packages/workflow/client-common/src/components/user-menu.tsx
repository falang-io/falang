import type React from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Dropdown, type MenuProps } from 'antd';
import { DownOutlined, KeyOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { authStore } from '../auth-store.js';
import { navigationStore } from '../navigation-store.js';

export interface IUserMenuProps {
  /** The trigger button's look — the app header highlights it on the Settings/Access tokens pages. */
  readonly style?: React.CSSProperties;
}

/** The signed-in user's login with a dropdown: Settings, Access tokens, Logout. The rightmost item of every top bar. */
export const UserMenu: React.FC<IUserMenuProps> = observer(({ style }) => {
  const t = getGlobalI18n().t;
  const user = authStore.currentUser;
  if (!user) return null;
  const items: MenuProps['items'] = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('client:user-menu.settings'),
      onClick: () => navigationStore.goToSettings(),
    },
    {
      key: 'tokens',
      icon: <KeyOutlined />,
      label: t('client:user-menu.tokens'),
      onClick: () => navigationStore.goToTokens(),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('client:user-menu.logout'),
      onClick: () => authStore.logout(),
    },
  ];
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button type="text" style={style} data-testid="user-menu">
        <UserOutlined />
        <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email ?? user.username}
        </span>
        <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />
      </Button>
    </Dropdown>
  );
});
