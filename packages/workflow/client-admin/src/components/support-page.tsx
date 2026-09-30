import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Badge, Button, Input, List, Typography } from 'antd';
import { adminSupportStore } from '../admin-support-store.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', gap: 16, height: 'calc(100vh - 56px - 48px)', minHeight: 320 },
  threads: { width: 300, flexShrink: 0, overflowY: 'auto', border: '1px solid #313244', borderRadius: 8 },
  conversation: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  messages: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 },
  bubble: { maxWidth: '75%', padding: '6px 10px', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  own: { alignSelf: 'flex-end', background: '#1668dc', color: '#fff' },
  theirs: { alignSelf: 'flex-start', background: '#313244', color: '#cdd6f4' },
  time: { display: 'block', fontSize: 11, opacity: 0.7, marginTop: 2 },
  threadItem: { cursor: 'pointer', padding: '8px 12px' },
  selected: { background: 'rgba(22, 104, 220, 0.2)' },
  preview: { display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};

/** Every user's support thread: conversations on the left, the selected one plus a reply box on the right. */
export const SupportPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = adminSupportStore;
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    store.startPagePolling();
    return () => store.stopPagePolling();
  }, [store]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [store.messages.length, store.selectedUserId]);

  const send = async (): Promise<void> => {
    if (!draft.trim() || store.sending) return;
    try {
      await store.reply(draft);
      setDraft('');
    } catch {
      // The store exposes the error; keep the draft.
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.threads} data-testid="support-threads">
        <Typography.Title level={5} style={{ margin: 12 }}>
          {t('workflow-client-admin:support.threads')}
        </Typography.Title>
        {store.threads.length === 0 ? (
          <Typography.Text type="secondary" style={{ padding: 12, display: 'block' }}>
            {t('workflow-client-admin:support.no-threads')}
          </Typography.Text>
        ) : (
          <List
            dataSource={store.threads.slice()}
            renderItem={(thread) => (
              <List.Item
                key={thread.userId}
                data-testid={`support-thread-${thread.username}`}
                style={{ ...styles.threadItem, ...(thread.userId === store.selectedUserId ? styles.selected : {}) }}
                onClick={() => store.select(thread.userId)}
              >
                <List.Item.Meta
                  title={thread.username}
                  description={<span style={styles.preview}>{thread.lastMessagePreview}</span>}
                />
                <Badge count={thread.unreadCount} size="small" />
              </List.Item>
            )}
          />
        )}
      </div>
      <div style={styles.conversation}>
        {store.selectedUserId === null ? (
          <Typography.Text type="secondary">{t('workflow-client-admin:support.select')}</Typography.Text>
        ) : (
          <>
            <div style={styles.messages} data-testid="support-conversation">
              {store.messages.length === 0 && (
                <Typography.Text type="secondary">{t('workflow-client-admin:support.empty')}</Typography.Text>
              )}
              {store.messages.map((message) => (
                <div
                  key={message.id}
                  style={{ ...styles.bubble, ...(message.authorRole === 'admin' ? styles.own : styles.theirs) }}
                >
                  {message.text}
                  <span style={styles.time}>{new Date(message.createdAt).toLocaleString()}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}
            <Input.TextArea
              data-testid="support-reply-input"
              value={draft}
              maxLength={4000}
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder={t('workflow-client-admin:support.placeholder')}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <Button
              type="primary"
              style={{ marginTop: 8, alignSelf: 'flex-end' }}
              disabled={!draft.trim()}
              loading={store.sending}
              onClick={() => send()}
            >
              {t('workflow-client-admin:support.send')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
