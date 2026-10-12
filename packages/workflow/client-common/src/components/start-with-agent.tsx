import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Input, Typography } from 'antd';
import { RobotOutlined, SendOutlined } from '@ant-design/icons';
import { setInitialAgentPrompt } from '../agent/agent-auto-start.js';
import { AgentSettingsStore } from '../agent/agent-settings-store.js';
import { navigationStore } from '../navigation-store.js';
import type { ProjectListStore } from '../project-list-store.js';

/** The empty list's prompt handler; `'loading'` while the agent status is unknown, `null` without a configured agent. */
export type TStartWithAgent = ((prompt: string) => Promise<void>) | 'loading' | null;

/**
 * Whether the empty project list offers the prompt box, and what it does: creates a project, hands it the prompt
 * (`setInitialAgentPrompt` — its `WorkflowStore` opens the agent panel and runs it) and opens it. Read by an
 * `observer` component, so the answer follows the agent status as it loads.
 */
export const useStartWithAgent = (store: ProjectListStore): TStartWithAgent => {
  // Created inside the effect (not `useState`'s initializer): `AgentSettingsStore.dispose()` is final, and StrictMode's
  // extra cleanup would otherwise leave the one instance disposed and loading forever.
  const [settings, setSettings] = useState<AgentSettingsStore | null>(null);
  useEffect(() => {
    const next = new AgentSettingsStore();
    setSettings(next);
    next.load();
    return () => next.dispose();
  }, []);
  if (!settings || settings.loading) return 'loading';
  if (!settings.configured) return null;
  return async (prompt: string) => {
    const project = await store.createProject(getGlobalI18n().t('client:project-list-page.default-project-name'));
    if (!project) return;
    setInitialAgentPrompt(project.id, prompt);
    navigationStore.selectProject(project.id, project.name);
  };
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    marginTop: 48,
    padding: 24,
    borderRadius: 12,
    border: '1px solid #313244',
    background: '#181825',
  },
  title: { color: '#cdd6f4', marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 },
  hint: { color: '#6c7086', display: 'block', marginBottom: 16 },
  actions: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 },
};

interface IProps {
  /** Creates the project and hands `prompt` to its agent; resolves once navigation happened (or failed). */
  readonly onStart: (prompt: string) => Promise<void>;
  readonly busy: boolean;
}

/**
 * The empty project list's first step: describe an automation in plain words — Enter creates a project, opens it
 * and starts the agent on that text (Shift+Enter for a new line).
 */
export const StartWithAgent: React.FC<IProps> = ({ onStart, busy }) => {
  const t = getGlobalI18n().t;
  const [prompt, setPrompt] = useState('');
  const canStart = Boolean(prompt.trim()) && !busy;

  const start = (): void => {
    if (!canStart) return;
    onStart(prompt.trim()).catch(() => null);
  };

  return (
    <div style={styles.root} data-testid="start-with-agent">
      <Typography.Title level={4} style={styles.title}>
        <RobotOutlined />
        {t('client:project-list-page.start-with-agent-title')}
      </Typography.Title>
      <Typography.Text style={styles.hint}>{t('client:project-list-page.start-with-agent-hint')}</Typography.Text>
      <Input.TextArea
        autoFocus
        autoSize={{ minRows: 3, maxRows: 10 }}
        value={prompt}
        disabled={busy}
        placeholder={t('client:project-list-page.start-with-agent-placeholder')}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            start();
          }
        }}
        data-testid="start-with-agent-input"
      />
      <div style={styles.actions}>
        <Button type="primary" icon={<SendOutlined />} loading={busy} disabled={!canStart} onClick={start}>
          {t('client:project-list-page.start-with-agent-submit')}
        </Button>
      </div>
    </div>
  );
};
