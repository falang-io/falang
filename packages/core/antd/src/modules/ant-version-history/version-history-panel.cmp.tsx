import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Input, List, Popconfirm, Space, Switch, Tag, Typography } from 'antd';
import { CheckOutlined, EditOutlined, HistoryOutlined, UndoOutlined } from '@ant-design/icons';
import type { ICommitInfo } from '@falang/versioning';
import { useVersionHistoryT } from './use-version-history-t.js';
import type { VersionHistoryStore } from './version-history.store.js';

export interface IVersionHistoryPanelProps {
  readonly store: VersionHistoryStore;
  /** Opens the split diff view — the caller decides how (a modal, a drawer, …); see `VersionDiffModal`. */
  readonly onOpenDiff: () => void;
  /** Browse and compare only — no commit, rename or restore (e.g. an admin viewing someone else's project). */
  readonly readOnly?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8 },
  commitRow: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%' },
  commitHeader: { display: 'flex', alignItems: 'center', gap: 6 },
  commitMessage: { flex: 1, wordBreak: 'break-word' },
  commitMeta: { fontSize: 11 },
  actions: { display: 'flex', gap: 4, flexWrap: 'wrap' },
};

const KIND_COLOR: Record<ICommitInfo['kind'], string> = { auto: 'default', named: 'blue' };

/** One commit row's inline "rename" affordance — a text input that swaps in for the message on click. */
const RenameControl: React.FC<{
  readonly commit: ICommitInfo;
  readonly onSubmit: (message: string) => void;
  readonly t: ReturnType<typeof useVersionHistoryT>;
}> = ({ commit, onSubmit, t }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(commit.message);
  if (!editing) {
    return (
      <Button
        size="small"
        type="text"
        icon={<EditOutlined />}
        onClick={() => {
          setValue(commit.message);
          setEditing(true);
        }}
      >
        {t('version-history:rename')}
      </Button>
    );
  }
  const submit = () => {
    setEditing(false);
    if (value.trim() && value !== commit.message) onSubmit(value.trim());
  };
  return (
    <Space.Compact size="small">
      <Input
        size="small"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={submit}
        onBlur={submit}
      />
      <Button size="small" icon={<CheckOutlined />} onClick={submit} />
    </Space.Compact>
  );
};

/**
 * The commit history list (ADR 0025 (private), "The diff UI"): a "name the
 * current version" affordance up top (the primary "Commit" action, per "Decisions (2026-09-17)" #2),
 * a "changes since last commit" indicator, the auto-saved-versions toggle, then the list itself with
 * per-row compare/rename/restore. Pure view over a `VersionHistoryStore` — no HTTP/IPC of its own.
 */
export const VersionHistoryPanel: React.FC<IVersionHistoryPanelProps> = observer(
  ({ store, onOpenDiff, readOnly = false }) => {
    const t = useVersionHistoryT();
    const [message, setMessage] = useState('');
    const [committing, setCommitting] = useState(false);

    const canCommit = store.dirty || message.trim().length > 0;

    const handleCommit = async () => {
      setCommitting(true);
      try {
        await store.commitNamed(message.trim() || t('version-history:default-message'));
        setMessage('');
      } finally {
        setCommitting(false);
      }
    };

    const handleCompareWithWorkingCopy = (commit: ICommitInfo) => {
      store.compare(commit, 'working-copy');
      onOpenDiff();
    };

    const handleCompareWithPrevious = (commit: ICommitInfo, index: number) => {
      const previous = store.commits[index + 1];
      if (!previous) return;
      store.compare(previous, commit);
      onOpenDiff();
    };

    return (
      <div className="version-history-panel" style={styles.root}>
        {!readOnly && (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder={t('version-history:message-placeholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPressEnter={handleCommit}
            />
            <Button
              type="primary"
              icon={<HistoryOutlined />}
              loading={committing}
              disabled={!canCommit}
              onClick={handleCommit}
            >
              {store.dirty ? t('version-history:commit') : t('version-history:name-current-version')}
            </Button>
          </Space.Compact>
        )}

        {store.dirty && (
          <Space>
            <Tag color="warning">{t('version-history:changes-since-last-commit')}</Tag>
            <Button size="small" onClick={() => store.compareHeadWithWorkingCopy().then(onOpenDiff)}>
              {t('version-history:compare')}
            </Button>
          </Space>
        )}

        <Space>
          <Switch size="small" checked={store.showAuto} onChange={(checked) => store.setShowAuto(checked)} />
          <Typography.Text type="secondary">{t('version-history:show-auto-saved')}</Typography.Text>
        </Space>

        {store.error && <Alert type="error" showIcon message={store.error} />}

        <List<ICommitInfo>
          size="small"
          loading={store.loading}
          dataSource={store.visibleCommits}
          locale={{ emptyText: t('version-history:no-commits') }}
          renderItem={(commit) => {
            const index = store.commits.findIndex((c) => c.id === commit.id);
            const hasPrevious = index !== -1 && index + 1 < store.commits.length;
            return (
              <List.Item key={commit.id}>
                <div style={styles.commitRow}>
                  <div style={styles.commitHeader}>
                    <Tag color={KIND_COLOR[commit.kind]}>{t(`version-history:kind-${commit.kind}`)}</Tag>
                    <Typography.Text style={styles.commitMessage}>{commit.message}</Typography.Text>
                  </div>
                  <Typography.Text type="secondary" style={styles.commitMeta}>
                    {commit.author} · {new Date(commit.createdAt).toLocaleString()}
                  </Typography.Text>
                  <div style={styles.actions}>
                    <Button size="small" onClick={() => handleCompareWithWorkingCopy(commit)}>
                      {t('version-history:compare-with-working-copy')}
                    </Button>
                    {hasPrevious && (
                      <Button size="small" onClick={() => handleCompareWithPrevious(commit, index)}>
                        {t('version-history:compare-with-previous')}
                      </Button>
                    )}
                    {!readOnly && (
                      <RenameControl commit={commit} onSubmit={(msg) => store.nameCommit(commit.id, msg)} t={t} />
                    )}
                    {!readOnly && (
                      <Popconfirm
                        title={t('version-history:restore-confirm-title')}
                        description={t('version-history:restore-confirm-description')}
                        onConfirm={() => store.restore(commit.id)}
                      >
                        <Button size="small" danger icon={<UndoOutlined />}>
                          {t('version-history:restore')}
                        </Button>
                      </Popconfirm>
                    )}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
    );
  },
);
