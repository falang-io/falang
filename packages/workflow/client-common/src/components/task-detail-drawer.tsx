import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import ReactMarkdown from 'react-markdown';
import { workflowApi, type IApiTask, type ITaskOption } from '../api-client.js';
import type { TasksStore } from '../tasks-store.js';

interface Props {
  readonly taskId: string | null;
  readonly store: TasksStore;
  readonly onClose: () => void;
  readonly onResolved: (task: IApiTask) => void;
  readonly onOpenRun: (run: { workflowId: string; runId: string }) => void;
}

const statusColor = (status: IApiTask['status']): string => {
  if (status === 'done') return 'success';
  if (status === 'open') return 'processing';
  if (status === 'orphaned') return 'error';
  return 'default';
};

const isFlatObject = (value: unknown): value is Record<string, string | number | boolean | null> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v));

const payloadBlock = (payload: unknown): React.ReactNode => {
  if (payload === null) return null;
  if (isFlatObject(payload)) {
    return (
      <Descriptions column={1} size="small" bordered>
        {Object.entries(payload).map(([key, value]) => (
          <Descriptions.Item key={key} label={key}>
            {String(value)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  }
  return (
    <Typography.Paragraph code copyable style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
      {JSON.stringify(payload, null, 2)}
    </Typography.Paragraph>
  );
};

/** `null` means "not yet entered" — distinct from a real falsy value (`0`/`''`/`false`) the user typed. */
type TPendingValue = string | number | boolean | null;

/**
 * Shows one `IApiTask`'s full detail and, while `status === 'open'`, lets the project owner resolve it
 * — one button per `ITaskOption`; a non-`'void'` option reveals a typed input (`prompt` as its label)
 * plus a confirm step before `TasksStore.resolve` fires. See ADR 0040 (private) §5. Always re-fetches the task fresh
 * via `GET /tasks/:id` on open (like `RunDetailDrawer` fetches its own detail), since the row this was opened from may
 * be stale by the time it's resolved.
 */
export const TaskDetailDrawer: React.FC<Props> = ({ taskId, store, onClose, onResolved, onOpenRun }) => {
  const t = getGlobalI18n().t;
  const [task, setTask] = useState<IApiTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [pendingValues, setPendingValues] = useState<Record<string, TPendingValue>>({});
  const [resolvingLabel, setResolvingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    setTask(null);
    setErrorMessage(null);
    setSelectedLabel(null);
    setPendingValues({});
    setLoading(true);
    workflowApi
      .getTask(taskId)
      .then(setTask)
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:task-detail.failed-to-load')),
      )
      .finally(() => setLoading(false));
  }, [taskId, t]);

  const setPendingValue = (label: string, value: TPendingValue): void => {
    setPendingValues((prev) => ({ ...prev, [label]: value }));
  };

  const renderOptionInput = (option: ITaskOption): React.ReactNode => {
    const value = pendingValues[option.label];
    if (option.dataType === 'string') {
      return (
        <Input
          placeholder={option.prompt}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setPendingValue(option.label, e.target.value)}
          style={{ width: 220 }}
        />
      );
    }
    if (option.dataType === 'number') {
      return (
        <InputNumber
          placeholder={option.prompt}
          value={typeof value === 'number' ? value : null}
          onChange={(next) => setPendingValue(option.label, next)}
        />
      );
    }
    if (option.dataType === 'boolean') {
      return (
        <Space>
          {option.prompt && <Typography.Text>{option.prompt}</Typography.Text>}
          <Switch checked={value === true} onChange={(checked) => setPendingValue(option.label, checked)} />
        </Space>
      );
    }
    return null;
  };

  const handleResolve = (option: ITaskOption): void => {
    if (!task) return;
    setResolvingLabel(option.label);
    const value = pendingValues[option.label] ?? null;
    // A `null` `value` (never touched, or `option.dataType === 'void'`, which renders no input at all)
    // calls the two-arg overload so `resolveTask`'s body omits `data` entirely — the wire contract's
    // "void → data absent/undefined", not an explicit JSON `null`.
    const resolvePromise =
      value === null ? store.resolve(task.id, option.label) : store.resolve(task.id, option.label, value);
    resolvePromise
      .then((updated) => {
        setTask(updated);
        onResolved(updated);
      })
      .catch(() => {
        // `store.error` already carries the message; nothing further to do here.
      })
      .finally(() => setResolvingLabel(null));
  };

  return (
    <Drawer title={task?.title ?? taskId} open={taskId !== null} onClose={onClose} size={640} destroyOnHidden>
      {loading && <Spin />}
      {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}
      {task && (
        <>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('client:task-detail.status')}>
              <Tag color={statusColor(task.status)}>{task.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('client:task-detail.project')}>{task.projectName}</Descriptions.Item>
            <Descriptions.Item label={t('client:task-detail.env')}>{task.env}</Descriptions.Item>
            <Descriptions.Item label={t('client:task-detail.created-at')}>
              {new Date(task.createdAt).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label={t('client:task-detail.due-at')}>
              {task.dueAt ? new Date(task.dueAt).toLocaleString() : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('client:task-detail.resolved-at')}>
              {task.resolvedAt ? new Date(task.resolvedAt).toLocaleString() : '—'}
            </Descriptions.Item>
          </Descriptions>

          <Button
            style={{ marginBottom: 16 }}
            onClick={() => onOpenRun({ workflowId: task.workflowId, runId: task.runId })}
          >
            {t('client:task-detail.open-run')}
          </Button>

          {task.description && (
            <>
              <Typography.Title level={5}>{t('client:task-detail.description')}</Typography.Title>
              <div style={{ marginBottom: 16 }}>
                <ReactMarkdown>{task.description}</ReactMarkdown>
              </div>
            </>
          )}

          {task.payload !== null && (
            <>
              <Typography.Title level={5}>{t('client:task-detail.payload')}</Typography.Title>
              <div style={{ marginBottom: 16 }}>{payloadBlock(task.payload)}</div>
            </>
          )}

          {task.attachments.length > 0 && (
            <>
              <Typography.Title level={5}>{t('client:task-detail.attachments')}</Typography.Title>
              <ul style={{ marginBottom: 16 }}>
                {task.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    {attachment.publicUrl ? (
                      <a href={attachment.publicUrl} target="_blank" rel="noreferrer">
                        {attachment.name}
                      </a>
                    ) : (
                      <Typography.Text>
                        {attachment.name} ({attachment.size} B)
                      </Typography.Text>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {task.status === 'orphaned' && (
            <Alert
              style={{ marginBottom: 16 }}
              type="error"
              showIcon
              message={t('client:task-detail.orphaned')}
              description={task.orphanReason}
            />
          )}

          {task.status === 'open' && (
            <>
              <Typography.Title level={5}>{t('client:task-detail.resolve')}</Typography.Title>
              {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}
              <Space direction="vertical">
                {task.options.map((option) =>
                  option.dataType === 'void' ? (
                    <Popconfirm
                      key={option.label}
                      title={t('client:task-detail.resolve-confirm', { label: option.label })}
                      onConfirm={() => handleResolve(option)}
                    >
                      <Button type="primary" loading={resolvingLabel === option.label}>
                        {option.label}
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Space key={option.label}>
                      <Button
                        type={selectedLabel === option.label ? 'primary' : 'default'}
                        onClick={() => setSelectedLabel(option.label)}
                      >
                        {option.label}
                      </Button>
                      {selectedLabel === option.label && (
                        <>
                          {renderOptionInput(option)}
                          <Button
                            type="primary"
                            loading={resolvingLabel === option.label}
                            onClick={() => handleResolve(option)}
                          >
                            {t('client:task-detail.confirm')}
                          </Button>
                        </>
                      )}
                    </Space>
                  ),
                )}
              </Space>
            </>
          )}
        </>
      )}
    </Drawer>
  );
};
