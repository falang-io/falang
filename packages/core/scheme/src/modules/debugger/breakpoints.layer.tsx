import { observer } from 'mobx-react-lite';
import { TOKEN_SCHEME } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import type { IconStore } from '../../store/icon.store.js';
import { CMD_TOGGLE_BREAKPOINT } from './debugger.command.js';
import { TOKEN_DEBUGGER } from './debugger.service.token.js';

export const BREAKPOINT_DOT_SIZE = 12;

/** A red disc at the icon's top-left corner (`icon.x` is the icon's vertical axis, `icon.left` the distance from it to the left edge — same coordinate space `ValencePointsLayer` positions its dots in). Hollow while no session is running: "will apply on the next start". */
const BreakpointDot: React.FC<{ icon: IconStore; armed: boolean }> = observer(({ icon, armed }) => {
  const scheme = useService(TOKEN_SCHEME);
  return (
    <div
      className={armed ? 'debug-breakpoint armed' : 'debug-breakpoint'}
      data-node-id={icon.id}
      style={{
        left: icon.x - icon.left - BREAKPOINT_DOT_SIZE / 2,
        top: icon.y + 2,
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        scheme.commands.dispatchCommand(CMD_TOGGLE_BREAKPOINT, { nodeId: icon.id });
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    />
  );
});

export const BreakpointsLayer: React.FC = observer(() => {
  const debuggerService = useService(TOKEN_DEBUGGER);
  const armed = debuggerService.session.isActive;
  return (
    <div className="debug-breakpoints-layer">
      {debuggerService.breakpointIcons.map((icon) => (
        <BreakpointDot key={icon.id} icon={icon} armed={armed} />
      ))}
    </div>
  );
});
