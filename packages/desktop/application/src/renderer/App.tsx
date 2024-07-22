import 'normalize.css/normalize.css';
import './app.css';
import '@falang/styles';
//import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import { AppState } from './AppState';
import { IdeComponent } from '@falang/editor-ide';
import { SchemeComponent } from '@falang/editor-scheme';
import { observer } from 'mobx-react';
import { AboutModalComponent } from './AboutModal.cmp';

const appState = new AppState();

export const App = observer(() => <>
  <IdeComponent ide={appState.ide} />
  {appState.exportSchemeStore ? <div style={{ visibility: 'hidden' }} id="exportSchemeComponent">
    <SchemeComponent scheme={appState.exportSchemeStore} />
  </div> : null}
  <AboutModalComponent state={appState} />
</>);
