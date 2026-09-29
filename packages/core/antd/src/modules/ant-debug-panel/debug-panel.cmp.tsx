import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Empty, Space, Table, Tag, Typography } from 'antd';
import { CaretRightOutlined, PlayCircleOutlined, StepForwardOutlined, StopOutlined } from '@ant-design/icons';
import type { IDebugLocation, IDebugVariable, TDebugValue } from '@falang/debug';
import {
  getGlobalI18n,
  TOKEN_I18N,
  useService,
  type DebugSessionStore,
  type TDebugSessionStatus,
  type TFunction,
} from '@falang/scheme';

export interface IDebugPanelProps {
  readonly session: DebugSessionStore;
  /** When given, an idle/terminated session shows a "Start" button calling this — how a session starts (function, args, port…) is the host's business. */
  readonly onStart?: () => void;
  /** Called when the user clicks the current location — the host opens that document's tab and pans to the node (e.g. `WorkflowStore.jumpToNode`). */
  readonly onJumpToNode?: (location: IDebugLocation) => void;
  /** Human-readable "document › node" for a location; defaults to the raw ids. */
  readonly resolveLocationTitle?: (location: IDebugLocation) => string;
}

/** The panel is normally rendered inside a scheme's container, but hosts since ADR 0036 mount it in a
 *  project-level right sidebar outside every scheme's `ContainerContext` — fall back to `getGlobalI18n()`,
 *  the same process-wide `I18NStore` instance (the `debugger:` strings come from `@falang/scheme`'s
 *  `CoreLocalesModule`, registered there by any scheme build), like `useAgentChatT`. Falling back to
 *  identity showed raw keys (`debugger:status-paused`) in the workflow client's debug panel. */
const useT = (): TFunction => {
  try {
    return useService(TOKEN_I18N).t;
  } catch {
    return getGlobalI18n().t;
  }
};

const STATUS_COLORS: Record<TDebugSessionStatus, string> = {
  idle: 'default',
  starting: 'processing',
  running: 'blue',
  paused: 'orange',
  terminated: 'default',
};

const formatValue = (value: TDebugValue): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || typeof value !== 'object') return String(value);
  return JSON.stringify(value, null, 1);
};

const VariablesTable: React.FC<{ variables: readonly IDebugVariable[]; t: TFunction }> = ({ variables, t }) => (
  <Table<IDebugVariable>
    size="small"
    pagination={false}
    rowKey="name"
    dataSource={[...variables]}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('debugger:no-variables')} /> }}
    columns={[
      {
        title: t('debugger:variable'),
        dataIndex: 'name',
        width: '40%',
        render: (name: string, variable) => (
          <>
            <Typography.Text code>{name}</Typography.Text>
            {variable.type ? (
              <Typography.Text type="secondary" style={{ marginLeft: 4, fontSize: 11 }}>
                {variable.type}
              </Typography.Text>
            ) : null}
          </>
        ),
      },
      {
        title: t('debugger:value'),
        dataIndex: 'value',
        render: (value: TDebugValue) => (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
            {formatValue(value)}
          </pre>
        ),
      },
    ]}
  />
);

/**
 * The shared debugger panel (ADR 0021 §3): status, continue / step-over / stop, the paused
 * location (clickable), the variables in scope and any program output. Pure view over a
 * `DebugSessionStore`; hosts place it in their right-hand sidebar next to the icon editor.
 */
export const DebugPanel: React.FC<IDebugPanelProps> = observer(
  ({ session, onStart, onJumpToNode, resolveLocationTitle }) => {
    const t = useT();
    const { status, pausedLocation, pauseReason, terminationReason, lastError } = session;
    const isPaused = status === 'paused';
    const statusText =
      status === 'terminated' && terminationReason
        ? `${t(`debugger:status-terminated`)}: ${t(`debugger:terminated-${terminationReason}`)}`
        : t(`debugger:status-${status}`);

    return (
      <div className="debug-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Space wrap>
          <Tag color={STATUS_COLORS[status]}>{statusText}</Tag>
          {isPaused && pauseReason ? (
            <Typography.Text type="secondary">{t(`debugger:reason-${pauseReason}`)}</Typography.Text>
          ) : null}
        </Space>
        <Space wrap>
          {onStart && !session.isActive ? (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={onStart}>
              {t('debugger:start')}
            </Button>
          ) : null}
          <Button
            size="small"
            icon={<CaretRightOutlined />}
            disabled={!isPaused}
            onClick={() => session.resume('continue')}
          >
            {t('debugger:continue')}
          </Button>
          <Button
            size="small"
            icon={<StepForwardOutlined />}
            disabled={!isPaused}
            onClick={() => session.resume('step-over')}
          >
            {t('debugger:step-over')}
          </Button>
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={!session.isActive}
            onClick={() => session.stop()}
          >
            {t('debugger:stop')}
          </Button>
        </Space>
        {lastError ? <Alert type="error" showIcon message={lastError} /> : null}
        {pausedLocation ? (
          <div>
            <Typography.Text type="secondary">{t('debugger:current-node')}: </Typography.Text>
            {onJumpToNode ? (
              <Typography.Link onClick={() => onJumpToNode(pausedLocation)}>
                {resolveLocationTitle
                  ? resolveLocationTitle(pausedLocation)
                  : `${pausedLocation.documentId} › ${pausedLocation.nodeId}`}
              </Typography.Link>
            ) : (
              <Typography.Text>
                {resolveLocationTitle
                  ? resolveLocationTitle(pausedLocation)
                  : `${pausedLocation.documentId} › ${pausedLocation.nodeId}`}
              </Typography.Text>
            )}
          </div>
        ) : null}
        {isPaused ? <VariablesTable variables={session.variables} t={t} /> : null}
        {session.output.length > 0 ? (
          <div>
            <Typography.Text type="secondary">{t('debugger:output')}</Typography.Text>
            <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>{session.output.join('\n')}</pre>
          </div>
        ) : null}
      </div>
    );
  },
);
