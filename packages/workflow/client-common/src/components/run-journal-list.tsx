import type React from 'react';
import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Empty, Select, Spin, Switch, Tag, Typography } from 'antd';
import {
  ExclamationCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import type { IApiRunJournalEntry, TApiRunJournalKind, TApiRunJournalLevel } from '../api-types.js';
import {
  filterJournalEntries,
  JOURNAL_KINDS,
  JOURNAL_LEVELS,
  NO_JOURNAL_FILTERS,
  splitJournalData,
  type IJournalFilters,
} from '../run-journal-model.js';
import type { RunJournalStore } from '../run-journal-store.js';

export interface IRunJournalListProps {
  readonly store: RunJournalStore;
  /** Display name of the icon a row points at; `null` when unknown (document/node gone, scheme not loaded). */
  readonly resolveNode?: (documentId: string, nodeId: string) => string | null;
  /** Makes the node label a link: open the document and highlight the node. Omit where there is no editor (Runs page). */
  readonly onJumpToNode?: (documentId: string, nodeId: string) => void;
  /** Shows each row's run id tail — for the per-workflow ("whole conversation") view. */
  readonly showRunId?: boolean;
  /** Narrow layout for the right-hand panel. */
  readonly compact?: boolean;
}

const KIND_ICONS: Record<TApiRunJournalKind, React.ReactNode> = {
  log: <FileTextOutlined />,
  trigger: <ThunderboltOutlined />,
  'user-input': <UserOutlined />,
  ai: <RobotOutlined />,
  'message-out': <MessageOutlined />,
  error: <ExclamationCircleOutlined />,
};

const LEVEL_COLORS: Record<TApiRunJournalLevel, string> = { info: 'default', warn: 'warning', error: 'error' };

const KIND_TAG_COLORS: Record<TApiRunJournalKind, string> = {
  log: 'default',
  trigger: 'blue',
  'user-input': 'purple',
  ai: 'cyan',
  'message-out': 'green',
  error: 'error',
};

const ROW_BACKGROUNDS: Record<TApiRunJournalLevel, string> = {
  info: 'transparent',
  warn: 'rgba(249, 226, 175, 0.1)',
  error: 'rgba(243, 139, 168, 0.12)',
};

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 },
  filters: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  row: { borderBottom: '1px solid rgba(128,128,128,0.25)', padding: '4px 6px', cursor: 'pointer' },
  head: { display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' },
  time: { fontFamily: 'ui-monospace, monospace', fontSize: 11, opacity: 0.7 },
  message: { flex: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
  details: { padding: '6px 0 4px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  text: { whiteSpace: 'pre-wrap', margin: 0, overflowWrap: 'anywhere' },
};

const JournalRow: React.FC<{
  entry: IApiRunJournalEntry;
  props: IRunJournalListProps;
}> = ({ entry, props }) => {
  const t = getGlobalI18n().t;
  const [open, setOpen] = useState(false);
  const { texts, rest } = useMemo(() => splitJournalData(entry.data), [entry.data]);
  const hasDetails = texts.length > 0 || rest !== null;
  const nodeLabel =
    entry.documentId && entry.nodeId ? (props.resolveNode?.(entry.documentId, entry.nodeId) ?? null) : null;
  const canJump = Boolean(props.onJumpToNode && entry.documentId && entry.nodeId && nodeLabel !== null);

  return (
    <div
      style={{ ...styles.row, background: ROW_BACKGROUNDS[entry.level] }}
      data-testid="run-journal-row"
      data-kind={entry.kind}
      data-level={entry.level}
      onClick={() => hasDetails && setOpen(!open)}
    >
      <div style={styles.head}>
        <span style={styles.time}>{new Date(entry.ts).toLocaleTimeString()}</span>
        <Tag icon={KIND_ICONS[entry.kind]} color={KIND_TAG_COLORS[entry.kind]} style={{ marginInlineEnd: 0 }}>
          {t(`client:run-journal.kind-${entry.kind}`)}
        </Tag>
        {entry.level !== 'info' && (
          <Tag color={LEVEL_COLORS[entry.level]}>{t(`client:run-journal.level-${entry.level}`)}</Tag>
        )}
        {nodeLabel !== null &&
          (canJump ? (
            <Typography.Link
              data-testid="run-journal-node-link"
              onClick={(event) => {
                event.stopPropagation();
                if (entry.documentId && entry.nodeId) props.onJumpToNode?.(entry.documentId, entry.nodeId);
              }}
            >
              › {nodeLabel}
            </Typography.Link>
          ) : (
            <span style={{ opacity: 0.8 }}>› {nodeLabel}</span>
          ))}
        {entry.vendor && <Tag style={{ marginInlineEnd: 0 }}>{entry.vendor}</Tag>}
        {props.showRunId && entry.runId && <span style={styles.time}>{entry.runId.slice(0, 8)}</span>}
        {entry.textsStripped && <Tag color="gold">{t('client:run-journal.texts-stripped')}</Tag>}
        {entry.truncated && <Tag color="orange">{t('client:run-journal.truncated')}</Tag>}
      </div>
      <div style={styles.message}>{entry.message}</div>
      {open && hasDetails && (
        <div style={styles.details} onClick={(event) => event.stopPropagation()}>
          {texts.map((item) => (
            <div key={item.key}>
              <Typography.Text type="secondary">{item.key}</Typography.Text>
              <Typography.Paragraph style={styles.text} copyable>
                {item.value}
              </Typography.Paragraph>
            </div>
          ))}
          {rest !== null && (
            <Typography.Paragraph code style={styles.text}>
              {JSON.stringify(rest, null, 2)}
            </Typography.Paragraph>
          )}
        </div>
      )}
    </div>
  );
};

const JournalFilters: React.FC<{
  filters: IJournalFilters;
  onChange: (filters: IJournalFilters) => void;
  compact?: boolean;
}> = ({ filters, onChange, compact }) => {
  const t = getGlobalI18n().t;
  return (
    <div style={styles.filters}>
      <Select<TApiRunJournalKind[]>
        mode="multiple"
        size="small"
        allowClear
        style={{ minWidth: compact ? 120 : 180 }}
        placeholder={t('client:run-journal.filter-kind')}
        value={[...filters.kinds]}
        onChange={(kinds) => onChange({ ...filters, kinds })}
        options={JOURNAL_KINDS.map((kind) => ({ value: kind, label: t(`client:run-journal.kind-${kind}`) }))}
        data-testid="run-journal-filter-kind"
      />
      <Select<TApiRunJournalLevel | null>
        size="small"
        allowClear
        style={{ minWidth: 100 }}
        placeholder={t('client:run-journal.filter-level')}
        value={filters.level}
        onChange={(level) => onChange({ ...filters, level: level ?? null })}
        options={JOURNAL_LEVELS.map((level) => ({ value: level, label: t(`client:run-journal.level-${level}`) }))}
        data-testid="run-journal-filter-level"
      />
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <Switch
          size="small"
          checked={filters.errorsOnly}
          onChange={(errorsOnly) => onChange({ ...filters, errorsOnly })}
          data-testid="run-journal-errors-only"
        />
        {t('client:run-journal.errors-only')}
      </span>
    </div>
  );
};

/** Run journal rows with kind/level filters, an "errors only" toggle and "Load more" (ADR 0059 (private)). */
export const RunJournalList: React.FC<IRunJournalListProps> = observer((props) => {
  const t = getGlobalI18n().t;
  const { store } = props;
  const [filters, setFilters] = useState<IJournalFilters>(NO_JOURNAL_FILTERS);
  const visible = filterJournalEntries(store.entries, filters);

  return (
    <div style={styles.root} data-testid="run-journal">
      <JournalFilters filters={filters} onChange={setFilters} compact={props.compact} />

      {store.error && <Alert type="warning" showIcon message={store.error} />}
      {store.loading && store.isEmpty && <Spin size="small" />}
      {!store.loading && !store.error && store.isEmpty && <Empty description={t('client:run-journal.empty')} />}
      {!store.isEmpty && visible.length === 0 && (
        <Typography.Text type="secondary">{t('client:run-journal.no-match')}</Typography.Text>
      )}

      <div data-testid="run-journal-rows">
        {visible.map((entry) => (
          <JournalRow key={entry.id} entry={entry} props={props} />
        ))}
      </div>

      {store.hasMore && (
        <Button
          size="small"
          loading={store.loading}
          onClick={() => store.loadMore()}
          data-testid="run-journal-load-more"
        >
          {t('client:run-journal.load-more')}
        </Button>
      )}
    </div>
  );
});
