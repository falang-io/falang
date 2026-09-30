import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Drawer, Input, Typography } from 'antd';
import { supportStore } from '../support-store.js';

const styles: Record<string, React.CSSProperties> = {
  list: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 },
  bubble: { maxWidth: '85%', padding: '6px 10px', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  own: { alignSelf: 'flex-end', background: '#1668dc', color: '#fff' },
  admin: { alignSelf: 'flex-start', background: '#313244', color: '#cdd6f4' },
  time: { display: 'block', fontSize: 11, opacity: 0.7, marginTop: 2 },
  footer: { display: 'flex', flexDirection: 'column', gap: 8 },
};

/** The user's support chat (`SupportStore`) — Enter sends, Shift+Enter inserts a newline. */
export const SupportDrawer: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const store = supportStore;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [store.messages.length, store.drawerOpen]);

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
    <Drawer
      title={t('client:support.title')}
      open={store.drawerOpen}
      onClose={() => store.close()}
      size="default"
      styles={{ body: { display: 'flex', flexDirection: 'column' } }}
      footer={
        <div style={styles.footer}>
          {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}
          <Input.TextArea
            data-testid="support-input"
            value={draft}
            maxLength={4000}
            autoSize={{ minRows: 2, maxRows: 6 }}
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
      }
    >
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
    </Drawer>
  );
});
