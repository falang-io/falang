// oxlint-disable no-console
// oxlint-disable max-lines
import { SchemeComponent, TOKEN_HISTORY } from '@falang/scheme';
import { TOKEN_AGENT_SESSION } from '@falang/agent';
import { resolveService } from '@falang/di';
import { observer } from 'mobx-react-lite';
import { scheme } from './functional.tsx';

const history = resolveService(TOKEN_HISTORY, scheme.container);
const agentSession = resolveService(TOKEN_AGENT_SESSION, scheme.container);

export const App = observer(() => (
  <>
    <div
      style={{
        position: 'absolute',
        left: 10,
        top: 10,
        zIndex: 100,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <button onClick={() => console.log(scheme)}>Log</button>
      <button onClick={() => agentSession.run('demo')}>Run agent</button>
      <button onClick={() => history.back()}>Undo</button>
      <button onClick={() => history.forward()}>Redo</button>
      <span>
        agent: {agentSession.status}
        {agentSession.error ? ` — ${agentSession.error}` : ''}
      </span>
    </div>
    <SchemeComponent scheme={scheme} />
  </>
));

export default App;
