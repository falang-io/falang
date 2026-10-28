import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Badge, Button, Input, theme, Tooltip, Typography } from 'antd';
import { CloseOutlined, CommentOutlined } from '@ant-design/icons';
import { supportStore } from '../support-store.js';

const styles: Record<string, React.CSSProperties> = {
  fab: {
    position: 'fixed',
    right: 20,
    bottom: 20,
    zIndex: 1050,
  },
  fabButton: {
    width: 48,
    height: 48,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
  },
  popup: {
    position: 'fixed',
    right: 20,
    bottom: 80,
    zIndex: 1050,
    width: 360,
    maxWidth: 'calc(100vw - 40px)',
    height: 520,
    maxHeight: 'calc(100vh - 110px)',
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e2e',
    border: '1px solid #45475a',
    borderRadius: 12,
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 10px 16px',
    background: '#181825',
    borderBottom: '1px solid #313244',
    color: '#cdd6f4',
    fontWeight: 600,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
  },
  bubble: { maxWidth: '85%', padding: '6px 10px', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  own: { alignSelf: 'flex-end', background: '#1668dc', color: '#fff' },
  admin: { alignSelf: 'flex-start', background: '#313244', color: '#cdd6f4' },
  time: { display: 'block', fontSize: 11, opacity: 0.7, marginTop: 2 },
  footer: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderTop: '1px solid #313244' },
};

/** The chat itself — Enter sends, Shift+Enter inserts a newline, Escape closes. */
const SupportPopup: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const store = supportStore;
  // Plain elements outside an antd component don't get the theme font on their own.
  const { token } = theme.useToken();

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [store.messages.length]);

  // No mask, so Escape is the keyboard way out — whatever has focus (the popup doesn't trap it).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') store.close();
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [store]);

  const send = async (): Promise<void> => {
    const text = draft;
    if (!text.trim() || store.sending) return;
    try {
      await store.send(text);
      setDraft('');
    } catch {
      // The store exposes the error; keep the draft.
    }
  };

  return (
    <div
      style={{ ...styles.popup, fontFamily: token.fontFamily, fontSize: token.fontSize }}
      role="dialog"
      aria-label={t('client:support.title')}
      data-testid="support-popup"
    >
      <div style={styles.header}>
        <span>{t('client:support.title')}</span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label={t('client:support.close')}
          onClick={() => store.close()}
        />
      </div>
      <div style={styles.list} data-testid="support-messages">
        {store.messages.length === 0 && <Typography.Text type="secondary">{t('client:support.empty')}</Typography.Text>}
        {store.messages.map((message) => (
          <div
            key={message.id}
            data-testid={message.authorRole === 'user' ? 'support-message-own' : 'support-message-admin'}
            style={{ ...styles.bubble, ...(message.authorRole === 'user' ? styles.own : styles.admin) }}
          >
            {message.text}
            <span style={styles.time}>{new Date(message.createdAt).toLocaleString()}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={styles.footer}>
        {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}
        <Input.TextArea
          data-testid="support-input"
          autoFocus
          value={draft}
          maxLength={4000}
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder={t('client:support.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button type="primary" disabled={!draft.trim()} loading={store.sending} onClick={() => send()}>
          {t('client:support.send')}
        </Button>
      </div>
    </div>
  );
});

/**
 * The support chat (`SupportStore`): a round chat button in the bottom-right corner with the unread badge, and the
 * chat popup above it — over everything, without dimming the page. Mounted once by `App` for a signed-in user, so it
 * is the same on every page and inside a project; mounting starts the unread poll, unmounting stops it.
 */
export const SupportWidget: React.FC = observer(() => {
  const t = getGlobalI18n().t;

  useEffect(() => {
    supportStore.acquire();
    return () => supportStore.release();
  }, []);

  return (
    <>
      {supportStore.chatOpen && <SupportPopup />}
      <div style={styles.fab}>
        <Tooltip title={supportStore.chatOpen ? null : t('client:support.button')} placement="left">
          <Badge count={supportStore.unreadCount} size="small" offset={[-4, 4]}>
            <Button
              type="primary"
              shape="circle"
              style={styles.fabButton}
              icon={supportStore.chatOpen ? <CloseOutlined /> : <CommentOutlined style={{ fontSize: 20 }} />}
              aria-label={t('client:support.button')}
              aria-expanded={supportStore.chatOpen}
              data-testid="support-button"
              onClick={() => (supportStore.chatOpen ? supportStore.close() : supportStore.open())}
            />
          </Badge>
        </Tooltip>
      </div>
    </>
  );
});
