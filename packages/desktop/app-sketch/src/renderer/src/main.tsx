import 'reflect-metadata';
import './app.css';
import '@falang/typescript-scheme/src/browser.js';
import '@falang/simple-code-scheme/src/browser.js';
import '@falang/text-scheme/src/browser.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';

const rootElement = document.querySelector('#root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
