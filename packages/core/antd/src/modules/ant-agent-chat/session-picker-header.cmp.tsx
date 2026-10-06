import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Input, Popconfirm, Select, Space, Tag } from 'antd';
import { CloseOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useAgentChatT } from './use-agent-chat-t.js';
import type { AgentChatSessionStore } from './agent-chat.store.js';
import { downloadAgentChatSessionExport } from './export-agent-chat-session.js';

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', gap: 4, alignItems: 'center' },
};

/** Session picker + new/rename/delete — split out from `AgentChatPanel` to keep that component's own
 *  (and this file's own) size down. */
export interface ISessionPickerHeaderProps {
  readonly store: AgentChatSessionStore;
  readonly model?: string | null;
  /** Shows a close (×) button at the end of the row when set. */
  readonly onClose?: () => void;
}

export const SessionPickerHeader: React.FC<ISessionPickerHeaderProps> = observer(({ store, model, onClose }) => {
  const t = useAgentChatT();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const activeSession = store.activeSession;

  if (renaming && activeSession) {
    return (
      <div style={styles.header}>
        <Space.Compact style={{ flex: 1 }}>
          <Input
            size="small"
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onPressEnter={() => {
              setRenaming(false);
              if (renameValue.trim()) store.rename(activeSession.id, renameValue.trim());
            }}
            onBlur={() => setRenaming(false)}
          />
        </Space.Compact>
      </div>
    );
  }

  return (
    <div style={styles.header}>
      <Select
        size="small"
        style={{ flex: 1 }}
        placeholder={t('agent-chat:no-sessions')}
        value={activeSession?.id}
        loading={store.loading}
        options={store.sessions.map((session) => ({ label: session.title, value: session.id }))}
        onChange={(id) => store.selectSession(id)}
      />
      <Button
        size="small"
        icon={<PlusOutlined />}
        title={t('agent-chat:new-session')}
        onClick={() => store.createSession()}
      />
      {activeSession ? (
        <Button
          size="small"
          icon={<EditOutlined />}
          title={t('agent-chat:rename')}
          onClick={() => {
            setRenameValue(activeSession.title);
            setRenaming(true);
          }}
        />
      ) : null}
      {activeSession ? (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          title={t('agent-chat:export-session')}
          onClick={() => downloadAgentChatSessionExport(activeSession)}
        />
      ) : null}
      {activeSession ? (
        <Popconfirm title={t('agent-chat:delete-confirm')} onConfirm={() => store.deleteSession(activeSession.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} title={t('agent-chat:delete')} />
        </Popconfirm>
      ) : null}
      {model ? <Tag>{model}</Tag> : null}
      {onClose ? (
        <Button
          size="small"
          type="text"
          icon={<CloseOutlined />}
          title={t('agent-chat:close-panel')}
          aria-label={t('agent-chat:close-panel')}
          data-testid="agent-chat-close"
          onClick={onClose}
        />
      ) : null}
    </div>
  );
});
