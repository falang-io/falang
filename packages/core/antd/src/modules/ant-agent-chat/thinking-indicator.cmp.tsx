import type React from 'react';
import { theme, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { describeToolCall, type AgentSession } from '@falang/agent';
import { useAgentChatT } from './use-agent-chat-t.js';

/**
 * Static keyframes, rendered inline next to the indicator (the package has no global stylesheet). Colours come in as
 * CSS custom properties from the antd theme tokens, so the same CSS fits the dark workflow client and the light
 * desktop apps; `prefers-reduced-motion` freezes everything.
 */
const THINKING_CSS = `
@keyframes falang-agent-thinking-dot {
  0%, 80%, 100% { transform: translateY(0) scale(0.7); opacity: 0.45; }
  40% { transform: translateY(-4px) scale(1); opacity: 1; }
}
@keyframes falang-agent-thinking-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@keyframes falang-agent-thinking-glow {
  0%, 100% { box-shadow: 0 0 0 0 var(--falang-thinking-glow); }
  50% { box-shadow: 0 0 12px 1px var(--falang-thinking-glow); }
}
.falang-agent-thinking {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--falang-thinking-border);
  background: var(--falang-thinking-bg);
  animation: falang-agent-thinking-glow 2.4s ease-in-out infinite;
}
.falang-agent-thinking__dots { display: inline-flex; gap: 4px; }
.falang-agent-thinking__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--falang-thinking-a), var(--falang-thinking-b));
  animation: falang-agent-thinking-dot 1.2s ease-in-out infinite;
}
.falang-agent-thinking__dot:nth-child(2) { animation-delay: 0.15s; }
.falang-agent-thinking__dot:nth-child(3) { animation-delay: 0.3s; }
.falang-agent-thinking__text {
  font-weight: 500;
  background: linear-gradient(90deg, var(--falang-thinking-text) 0%, var(--falang-thinking-text) 35%,
    var(--falang-thinking-b) 50%, var(--falang-thinking-text) 65%, var(--falang-thinking-text) 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: falang-agent-thinking-shimmer 2s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .falang-agent-thinking, .falang-agent-thinking__dot, .falang-agent-thinking__text { animation: none; }
}
`;

/**
 * Shown under the request while a turn runs: bouncing gradient dots and a shimmering "Thinking…" label, plus the
 * last tool call the agent made (so a long run visibly progresses between steps).
 */
export const ThinkingIndicator: React.FC<{ readonly agentSession: AgentSession }> = observer(({ agentSession }) => {
  const t = useAgentChatT();
  const { token } = theme.useToken();
  const steps = agentSession.steps;
  const lastStep = steps.at(-1);
  const vars = {
    '--falang-thinking-a': token.colorPrimary,
    '--falang-thinking-b': token.purple,
    '--falang-thinking-text': token.colorTextSecondary,
    '--falang-thinking-border': token.colorPrimaryBorder,
    '--falang-thinking-bg': token.colorPrimaryBg,
    '--falang-thinking-glow': token.colorPrimaryBorderHover,
  } as React.CSSProperties;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...vars }}>
      <style>{THINKING_CSS}</style>
      <div className="falang-agent-thinking" role="status" aria-live="polite" data-testid="agent-thinking">
        <span className="falang-agent-thinking__dots" aria-hidden="true">
          <span className="falang-agent-thinking__dot" />
          <span className="falang-agent-thinking__dot" />
          <span className="falang-agent-thinking__dot" />
        </span>
        <span className="falang-agent-thinking__text">{t('agent-chat:thinking')}</span>
      </div>
      {lastStep ? (
        <Typography.Text type="secondary" ellipsis style={{ fontSize: 11, maxWidth: '100%' }}>
          {describeToolCall(lastStep.call)}
        </Typography.Text>
      ) : null}
    </div>
  );
});
