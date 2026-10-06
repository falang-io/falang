import type React from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';

/** Static keyframes, rendered next to the bar (the client has no global stylesheet for workspace chrome). */
const SERVER_ACTIVITY_CSS = `
@keyframes falang-server-activity-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
@keyframes falang-server-activity-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.75); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes falang-server-activity-in {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.falang-server-activity__track {
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  overflow: hidden;
  background: rgba(137, 180, 250, 0.15);
}
.falang-server-activity__beam {
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, transparent, #89b4fa 30%, #cba6f7 70%, transparent);
  box-shadow: 0 0 8px #cba6f7;
  animation: falang-server-activity-sweep 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
.falang-server-activity__pill {
  position: absolute;
  top: 10px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid #45475a;
  background: rgba(30, 30, 46, 0.92);
  color: #cdd6f4;
  font-size: 13px;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  animation: falang-server-activity-in 0.2s ease-out both;
}
.falang-server-activity__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #89b4fa, #cba6f7);
  animation: falang-server-activity-pulse 1s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .falang-server-activity__beam { animation: none; width: 100%; }
  .falang-server-activity__dot, .falang-server-activity__pill { animation: none; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  // Zero-height anchor between the toolbar and the workspace body: the bar and the label float over the top edge
  // of the body without shifting the layout, and never take clicks.
  anchor: { position: 'relative', height: 0, zIndex: 20, pointerEvents: 'none' },
};

/**
 * A sweeping loading bar under the toolbar plus a label ("Starting the test stand…", "Publishing a new version…", …)
 * while a dev start/stop/restart, a publish or a prod start/stop is in flight — those take tens of seconds (build,
 * runner pod start), and the toolbar menus alone gave no sign that anything was happening.
 */
export const ServerActivityBar: React.FC = observer(() => {
  const store = useWorkflowStore();
  const activity = store.serverActivity;
  if (!activity) return null;
  const t = getGlobalI18n().t;
  return (
    <div style={styles.anchor} data-testid="server-activity" data-activity={activity}>
      <style>{SERVER_ACTIVITY_CSS}</style>
      <div className="falang-server-activity__track">
        <div className="falang-server-activity__beam" />
      </div>
      <div className="falang-server-activity__pill" role="status" aria-live="polite">
        <span className="falang-server-activity__dot" aria-hidden="true" />
        {t(`client:toolbar.server-activity.${activity}`)}
      </div>
    </div>
  );
});
