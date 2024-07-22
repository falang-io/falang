import "reflect-metadata";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { startRouter, MobxRouter } from 'mobx-router';
import { configure } from 'mobx';

import './index.css';
import 'normalize.css/normalize.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@falang/styles';

import reportWebVitals from './reportWebVitals';
import { getTextDoc } from './domains/try-page/temp-docs/textDoc';


//import {enableLogging} from 'mobx-logger';
 
//enableLogging();

configure({
    enforceActions: "always",
    computedRequiresReaction: true,
    //reactionRequiresObservable: true,
    //observableRequiresReaction: true,
    disableErrorBoundaries: true
});

const main =  async () => {
  /*if(location.pathname !== '/try' && !location.pathname.startsWith('/examples')) {
    location.href = '/try';
    return;
  }*/
  const { RootStore } = await import('./domains/core/store/Root.store');
  const { RootProvider } = await import('./domains/core/store/Root.context');
  const { LayoutComponent } = await import('./domains/core/layout/cmp/Layout.cmp');
  const { getRoutes } = await import('./routes');
  const { AllModals } = await import('./domains/core/modals/AllModals.cmp');
  const rootStore = new RootStore();
  const routes = getRoutes(rootStore);
  startRouter(routes, rootStore);
  rootStore.routes = routes;
  
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );
  
  root.render(
    <React.StrictMode>
      <RootProvider value={rootStore}>
        <LayoutComponent>
          <MobxRouter store={rootStore} />
          <AllModals modals={rootStore.modals} />
        </LayoutComponent>      
      </RootProvider>
    </React.StrictMode>
  );
};

main();

// If you want to start measuring performance in your app, pass a function
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
