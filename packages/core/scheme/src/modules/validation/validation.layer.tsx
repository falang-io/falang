import { observer } from 'mobx-react-lite';
import { TOKEN_SCHEME } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_VALIDATION_STORE } from './validation.store.token.js';

export const VALIDATION_MARKER_SIZE = 14;

/**
 * A small badge at the top-right corner of every block that has issues; hovering it shows the messages
 * (native `title`). Rendered for read-only schemes too.
 */
export const ValidationLayer: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  const store = useService(TOKEN_VALIDATION_STORE);
  const markers: React.ReactNode[] = [];
  for (const [iconId, issues] of store.issuesByIcon) {
    const icon = scheme.icons.getIconSafe(iconId);
    if (!icon || issues.length === 0) continue;
    const isError = issues.some((issue) => issue.severity === 'error');
    markers.push(
      <div
        key={iconId}
        className={isError ? 'validation-marker has-error' : 'validation-marker has-warning'}
        data-node-id={iconId}
        title={issues.map((issue) => issue.message).join('\n')}
        style={{ left: icon.x + icon.blockOwnRight - VALIDATION_MARKER_SIZE / 2, top: icon.y + 2 }}
      >
        !
      </div>,
    );
  }
  return <div className="validation-layer">{markers}</div>;
});
