import 'reflect-metadata';
import '@falang/workflow-client-common/src/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from '@falang/workflow-client-admin';

const rootElement = document.querySelector('#root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
