import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Badge, Button } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { supportStore } from '../support-store.js';
import { SupportDrawer } from './support-drawer.js';

export interface ISupportButtonProps {
  /** `text` matches the project list's `TopBar` actions; `default` matches the workspace toolbar buttons. */
  type?: 'text' | 'default';
  style?: React.CSSProperties;
}

/**
 * "Support" button with an unread badge plus the chat drawer it opens. Mounting it starts the unread poll
 * (`SupportStore.acquire`) and unmounting stops it — render at most one per screen (it owns the drawer).
 */
export const SupportButton: React.FC<ISupportButtonProps> = observer(({ type = 'text', style }) => {
  const t = getGlobalI18n().t;

  useEffect(() => {
    supportStore.acquire();
    return () => supportStore.release();
  }, []);

  return (
    <>
      <Badge count={supportStore.unreadCount} size="small" offset={[-4, 4]}>
        <Button
          type={type}
          style={style}
          icon={type === 'default' && <CustomerServiceOutlined />}
          data-testid="support-button"
          onClick={() => supportStore.open()}
        >
          {t('client:support.button')}
        </Button>
      </Badge>
      <SupportDrawer />
    </>
  );
});
