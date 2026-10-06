import type React from 'react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Collapse, Input, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { RedoOutlined, SendOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import {
  describeFileToolCall,
  describeToolCall,
  type AgentSession,
  type IAgentStep,
  type IChatTurn,
  type TAgentQuestionAnswer,
} from '@falang/agent';
import type { HistoryStore } from '@falang/scheme';
import { useAgentChatT } from './use-agent-chat-t.js';
import type { AgentChatSessionStore } from './agent-chat.store.js';
import { QuestionView } from './question-view.cmp.js';
import { SessionPickerHeader } from './session-picker-header.cmp.js';

const { TextArea } = Input;

const statusTagColor = (status: AgentSession['status']): string => {
  if (status === 'running') return 'processing';
  if (status === 'error') return 'error';
  if (status === 'awaiting-answer') return 'warning';
  return 'default';
};

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 },
  messages: { display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', flex: 1, minHeight: 120 },
  turn: { display: 'flex', flexDirection: 'column', gap: 4 },
  request: { fontWeight: 500 },
  reply: { whiteSpace: 'pre-wrap' },
  usage: { fontSize: 11 },
  options: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' },
  optionButton: { height: 'auto', textAlign: 'left', whiteSpace: 'normal' },
  stepDetail: { fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
};

/** One tool-call step — a readable one-liner (`describeToolCall`), ok/error tag, and click-to-expand raw input/result. */
const StepItem: React.FC<{ readonly step: IAgentStep }> = ({ step }) => {
  const [expanded, setExpanded] = useState(false);
  const t = useAgentChatT();
  const fileStep = describeFileToolCall(step.call);
  const label = fileStep
    ? t(`agent-chat:${fileStep.key}`, { ...fileStep.values, defaultValue: fileStep.text })
    : describeToolCall(step.call);
  return (
    <div>
      <Button
        type="link"
        size="small"
        onClick={() => setExpanded((value) => !value)}
        style={{ height: 'auto', padding: 0 }}
      >
        {label}
      </Button>
      <Tag color={step.result.ok ? 'success' : 'error'} style={{ marginLeft: 8 }}>
        {step.result.ok ? 'ok' : 'error'}
      </Tag>
      {expanded && (
        <Typography.Text type="secondary" style={styles.stepDetail}>
          {JSON.stringify(step.call.input)}
          {'\n→ '}
          {step.result.ok ? step.result.content : step.result.error}
        </Typography.Text>
      )}
    </div>
  );
};

const StepsCollapse: React.FC<{ readonly steps: readonly IAgentStep[] }> = ({ steps }) => {
  const t = useAgentChatT();
  if (steps.length === 0) return null;
  return (
    <Collapse
      size="small"
      items={[
        {
          children: (
            <Space direction="vertical" size={4}>
              {steps.map((step, index) => (
                // oxlint-disable-next-line no-array-index-key -- steps have no stable id of their own within a turn
                <StepItem key={index} step={step} />
              ))}
            </Space>
          ),
          key: 'steps',
          label: t('agent-chat:steps-count', { count: steps.length }),
        },
      ]}
    />
  );
};

/** A host's `renderError` result (if any) replaces the plain text: it is meant as the whole notice (e.g. a "buy credits" call to action). */
const ErrorNotice: React.FC<{
  readonly error: unknown;
  readonly text: string;
  readonly renderError?: (error: unknown) => ReactNode | null;
}> = ({ error, text, renderError }) => {
  const custom = error !== null && renderError ? renderError(error) : null;
  return custom ?? <Alert type="error" showIcon message={text} />;
};

const TurnView: React.FC<{
  readonly turn: IChatTurn;
  readonly rawError?: unknown;
  readonly renderError?: (error: unknown) => ReactNode | null;
  /** Set only for the open question's turn while nothing is running. */
  readonly onAnswer?: ((answer: TAgentQuestionAnswer) => void) | null;
}> = ({ turn, rawError, renderError, onAnswer }) => {
  const t = useAgentChatT();
  return (
    <div style={styles.turn}>
      <Typography.Text style={styles.request}>{turn.request}</Typography.Text>
      <StepsCollapse steps={turn.steps} />
      {turn.status === 'awaiting-answer' && turn.question ? (
        <QuestionView question={turn.question} onAnswer={onAnswer ?? null} />
      ) : null}
      {turn.status === 'error' ? (
        <ErrorNotice error={rawError} text={turn.error || t('agent-chat:failed')} renderError={renderError} />
      ) : null}
      {turn.status === 'done' ? <Typography.Text style={styles.reply}>{turn.message}</Typography.Text> : null}
      {turn.usage ? (
        <Typography.Text type="secondary" style={styles.usage}>
          {t('agent-chat:tokens', { count: turn.usage.totalTokens })}
        </Typography.Text>
      ) : null}
    </div>
  );
};

/** The in-progress turn, driven by the live `AgentSession` passed to the panel rather than a persisted `IChatTurn` — same shape as `TurnView` once it settles. */
const RunningTurnView: React.FC<{ readonly agentSession: AgentSession; readonly request: string }> = observer(
  ({ agentSession, request }) => {
    const t = useAgentChatT();
    return (
      <div style={styles.turn}>
        <Typography.Text style={styles.request}>{request}</Typography.Text>
        <StepsCollapse steps={agentSession.steps} />
        <Tag color="processing">{t('agent-chat:thinking')}</Tag>
      </div>
    );
  },
);

export interface IAgentChatPanelProps {
  readonly store: AgentChatSessionStore;
  /** The project's one `AgentSession` (ADR 0036 (private)) —
   *  never swapped on tab switch, unlike before that ADR. */
  readonly agentSession: AgentSession;
  /** The *active* document's `HistoryStore` — one agent run is one undo group per document touched
   *  (ADR 0034 (private)), so Undo/Redo here act on whichever document is currently on screen. `null`
   *  when the active view has no `HistoryStore` of its own (e.g. a non-scheme document, or nothing open at
   *  all) — Undo/Redo are then simply disabled; this never affects whether Send is enabled. */
  readonly history: HistoryStore | null;
  /** The document open in the editor at this moment, if it's one the agent can edit — read fresh at send
   *  time via `AgentSession.run`'s `activeDocumentId`, and on every render for `IChatTurn.documentId`
   *  bookkeeping — an observable-reading function so it tracks tab switches. `null` is a perfectly normal
   *  value (ADR 0036's "no home document" amendment: an empty project, or a non-agent-capable document, is
   *  still workable) and never disables Send by itself. */
  readonly getActiveDocumentId: () => string | null;
  readonly configured: boolean;
  readonly configuredLoading: boolean;
  readonly model: string | null;
  /** Optional host hook: given the original thrown value of a failed turn / send, return a node to show instead of the
   *  plain error text (replaces it, since it is meant as the full notice), or `null` for the default text. */
  readonly renderError?: (error: unknown) => ReactNode | null;
  /** Shows a close (×) button in the panel's header row when set — the host hides the panel. */
  readonly onClose?: () => void;
}

/**
 * The agent chat panel (ADR 0033 (private); project-scoped session and a
 * project-level `getActiveDocumentId()`/`history` seam since ADR 0036 (private), which also dropped the
 * old "open a document the agent can edit" requirement — the agent works fine with no document open) — a
 * session picker (new/rename/delete), a scrollable turn history (each turn's tool-call steps collapsed by
 * default, then its final reply), and the input box. Reused as-is by the workflow client and both desktop
 * apps; each host only supplies its own `AgentChatSessionStore` (built over its own `IAgentSessionStore`),
 * the project's one `AgentSession`, and `getActiveDocumentId()`/`history` resolved from whichever document
 * is currently active.
 */
export const AgentChatPanel: React.FC<IAgentChatPanelProps> = observer(
  ({
    store,
    agentSession,
    history,
    getActiveDocumentId,
    configured,
    configuredLoading,
    model,
    renderError,
    onClose,
  }) => {
    const t = useAgentChatT();
    const [request, setRequest] = useState('');

    const isRunning = store.sending || agentSession.status === 'running';
    const awaitingTurn = store.awaitingTurn;
    const canSend = configured && !configuredLoading && Boolean(request.trim()) && !isRunning && !awaitingTurn;

    const send = (): void => {
      if (!canSend) return;
      const text = request.trim();
      setRequest('');
      store.send(text, { agentSession, activeDocumentId: getActiveDocumentId() }).catch(() => null);
    };

    const answer = (value: TAgentQuestionAnswer): void => {
      store.answer(value, { agentSession, activeDocumentId: getActiveDocumentId() }).catch(() => null);
    };

    const activeSession = store.activeSession;
    const pendingRequest = store.pendingRequest;

    return (
      <div className="agent-chat-panel" style={styles.root}>
        {!configuredLoading && !configured ? (
          <Alert type="warning" showIcon message={t('agent-chat:not-configured')} />
        ) : null}

        <SessionPickerHeader store={store} model={configured ? model : null} onClose={onClose} />

        <Space wrap>
          <Tag color={statusTagColor(agentSession.status)}>{agentSession.status}</Tag>
          <Button
            size="small"
            icon={<UndoOutlined />}
            disabled={!history?.isBackAvailable}
            onClick={() => history?.back()}
          >
            {t('agent-chat:undo')}
          </Button>
          <Button
            size="small"
            icon={<RedoOutlined />}
            disabled={!history?.isForwardAvailable}
            onClick={() => history?.forward()}
          >
            {t('agent-chat:redo')}
          </Button>
          <Tooltip title={t('agent-chat:dont-ask-tooltip')}>
            <Space size={4}>
              <Switch
                size="small"
                checked={!store.allowQuestions}
                onChange={(checked) => store.setAllowQuestions(!checked)}
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('agent-chat:dont-ask')}
              </Typography.Text>
            </Space>
          </Tooltip>
        </Space>

        {store.error && <ErrorNotice error={store.rawError} text={store.error} renderError={renderError} />}

        <div style={styles.messages}>
          {(activeSession?.turns ?? []).map((turn) => (
            <TurnView
              key={turn.id}
              turn={turn}
              rawError={store.getTurnError(turn.id)}
              renderError={renderError}
              onAnswer={awaitingTurn?.id === turn.id && !isRunning ? answer : null}
            />
          ))}
          {pendingRequest !== null && <RunningTurnView agentSession={agentSession} request={pendingRequest} />}
        </div>

        <TextArea
          rows={3}
          placeholder={awaitingTurn ? t('agent-chat:question-answer-hint') : t('agent-chat:input-placeholder')}
          value={request}
          disabled={isRunning || !configured || configuredLoading || Boolean(awaitingTurn)}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send();
          }}
        />
        <Space>
          <Button type="primary" size="small" icon={<SendOutlined />} disabled={!canSend} onClick={send}>
            {t('agent-chat:send')}
          </Button>
          {isRunning ? (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => agentSession.cancel()}>
              {t('agent-chat:stop')}
            </Button>
          ) : null}
        </Space>
      </div>
    );
  },
);
