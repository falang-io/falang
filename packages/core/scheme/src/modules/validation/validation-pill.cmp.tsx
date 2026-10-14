import { useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { TOKEN_I18N, TOKEN_SCHEME } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import { scrollToNode } from '../../utils/scroll-to-node.js';
import { orderIssueSites, pickNextIssueIcon } from './validation-pill.js';
import { TOKEN_VALIDATION_STORE } from './validation.store.token.js';

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * "N errors" / "N warnings" pill in the top-right corner of a scheme (a core layer, so it does not move with the
 * canvas). Clicking it pans to the next icon with an issue, cycling; hidden when there are none (ADR 0068 (private)).
 */
export const ValidationPill: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  const store = useService(TOKEN_VALIDATION_STORE);
  const i18n = useService(TOKEN_I18N);
  const last = useRef<string | null>(null);
  const errors = store.errorCount;
  const warnings = store.warningCount;
  if (errors === 0 && warnings === 0) return null;
  const isError = errors > 0;
  const t = i18n.t;
  const text = isError
    ? t('validation:pill-errors', { count: errors })
    : t('validation:pill-warnings', { count: warnings });
  const color = isError ? '#d93025' : '#f5a623';
  const onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    const sites = [...store.issuesByIcon].flatMap(([iconId, issues]) => {
      const icon = scheme.icons.getIconSafe(iconId);
      return icon && issues.length > 0
        ? [{ iconId, x: icon.x, y: icon.y, hasError: issues.some((issue) => issue.severity === 'error') }]
        : [];
    });
    const next = pickNextIssueIcon(orderIssueSites(sites), last.current);
    if (next === null) return;
    last.current = next;
    scrollToNode(scheme, next);
  };
  return (
    <button
      type="button"
      className="validation-pill"
      data-testid="validation-pill"
      data-errors={errors}
      data-warnings={warnings}
      title={t('validation:pill-hint')}
      onClick={onClick}
      onMouseDown={stop}
      onMouseUp={stop}
      onContextMenu={stop}
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        padding: '2px 10px',
        border: `1px solid ${color}`,
        borderRadius: 12,
        background: `${color}22`,
        color,
        font: '600 12px/18px sans-serif',
        cursor: 'pointer',
      }}
    >
      {text}
      {store.isPending ? ' …' : ''}
    </button>
  );
});
