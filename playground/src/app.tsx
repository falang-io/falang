import { SchemeComponent } from '@falang/scheme';
import { DebugPanel } from '@falang/antd';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { observer } from 'mobx-react-lite';
import { JsonModal } from './json-modal.tsx';
import { playgroundStore as store } from './playground-store.ts';
import { Toolbar } from './toolbar.tsx';

const DebugSidebar = observer(() => {
  const { token } = antdTheme.useToken();
  return (
    <aside
      style={{
        width: 340,
        flexShrink: 0,
        overflow: 'auto',
        padding: 10,
        background: token.colorBgContainer,
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <DebugPanel session={store.session} onStart={() => store.session.start({ pauseOnEntry: true })} />
    </aside>
  );
});

export const App = observer(() => (
  <ConfigProvider theme={{ algorithm: store.theme.dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar store={store} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <main style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {/* Keyed by the scheme so a base-icon switch mounts a fresh canvas instead of reusing the old one's DOM. */}
          <SchemeComponent key={store.scheme.id} scheme={store.scheme} />
        </main>
        {store.debugPanelOpen ? <DebugSidebar /> : null}
      </div>
    </div>
    <JsonModal store={store} />
  </ConfigProvider>
));

export default App;
