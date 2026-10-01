import 'reflect-metadata';
import '@falang/workflow-client-common/src/app.css';
import '@falang/typescript-scheme/src/browser.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ClientExtensionsProvider, type IClientExtensions } from '@falang/workflow-client-common';

/** Mounts the workflow client into `#root` (or the given element) with the given extension slots. */
export const renderWorkflowApp = (extensions: IClientExtensions = {}, rootElement?: Element | null): void => {
  const root = rootElement ?? document.querySelector('#root');
  if (!root) throw new Error('Root element not found');
  createRoot(root).render(
    <StrictMode>
      <ClientExtensionsProvider extensions={extensions}>
        <App />
      </ClientExtensionsProvider>
    </StrictMode>,
  );
};
