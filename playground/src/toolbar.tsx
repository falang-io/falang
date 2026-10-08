// oxlint-disable no-console
import { TOKEN_HISTORY } from '@falang/scheme';
import { TOKEN_AGENT_SESSION } from '@falang/agent';
import { resolveService } from '@falang/di';
import { Button, Divider, Segmented, Select, Space, Switch, Tag, Tooltip, Typography, theme as antdTheme } from 'antd';
import { observer } from 'mobx-react-lite';
import { PLAYGROUND_ROOT_KINDS, type TPlaygroundRootKind } from './playground-scheme.tsx';
import type { PlaygroundStore } from './playground-store.ts';
import { PLAYGROUND_THEMES, type TPlaygroundThemeId } from './themes.ts';

const AGENT_STATUS_COLOR: Record<string, string> = {
  running: 'processing',
  done: 'success',
  error: 'error',
};

export const Toolbar = observer(({ store }: { store: PlaygroundStore }) => {
  const { token } = antdTheme.useToken();
  const { scheme } = store;
  const history = resolveService(TOKEN_HISTORY, scheme.container);
  const agentSession = resolveService(TOKEN_AGENT_SESSION, scheme.container);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 12px',
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Typography.Text strong>Falang playground</Typography.Text>
      <Divider orientation="vertical" />

      <Space size={4}>
        <Typography.Text type="secondary">Base icon</Typography.Text>
        <Segmented<TPlaygroundRootKind>
          size="small"
          value={store.rootKind}
          options={PLAYGROUND_ROOT_KINDS.map((kind) => ({ label: kind, value: kind }))}
          onChange={(kind) => store.setRootKind(kind)}
        />
        <Tooltip title="Start over with a fresh document of this kind">
          <Button size="small" onClick={() => store.rebuild()}>
            Reset
          </Button>
        </Tooltip>
      </Space>

      <Space size={4}>
        <Typography.Text type="secondary">Theme</Typography.Text>
        <Select<TPlaygroundThemeId>
          size="small"
          style={{ width: 130 }}
          value={store.themeId}
          options={PLAYGROUND_THEMES.map((theme) => ({ label: theme.label, value: theme.id }))}
          onChange={(themeId) => store.setTheme(themeId)}
        />
      </Space>

      <Space size={4}>
        <Switch size="small" checked={store.debugPanelOpen} onChange={(open) => store.setDebugPanelOpen(open)} />
        <Typography.Text>Debugger</Typography.Text>
      </Space>

      <Button size="small" onClick={() => store.setJsonOpen(true)}>
        JSON
      </Button>

      <Divider orientation="vertical" />

      <Space size={4}>
        <Button size="small" disabled={!history.isBackAvailable} onClick={() => history.back()}>
          Undo
        </Button>
        <Button size="small" disabled={!history.isForwardAvailable} onClick={() => history.forward()}>
          Redo
        </Button>
      </Space>

      <Space size={4}>
        <Button size="small" disabled={agentSession.status === 'running'} onClick={() => agentSession.run('demo')}>
          Run agent
        </Button>
        <Tooltip title={agentSession.error}>
          <Tag color={AGENT_STATUS_COLOR[agentSession.status]}>agent: {agentSession.status}</Tag>
        </Tooltip>
      </Space>

      <Button size="small" type="text" onClick={() => console.log(scheme)} style={{ marginLeft: 'auto' }}>
        Log scheme
      </Button>
    </div>
  );
});
