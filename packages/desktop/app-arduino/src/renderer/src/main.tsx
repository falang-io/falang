import 'reflect-metadata';
import './app.css';
import '@falang/typescript-scheme/src/browser.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { initializeDriverRegistry } from './driver-nodes/driver-registry-cache.js';
import { reportError } from '../../shared/report-error.js';

const rootElement = document.querySelector('#root');
if (!rootElement) throw new Error('Root element not found');

/**
 * Driver configs (ADR 0023 (private)'s Phase B/C) must be loaded before the first
 * `arduinoSchemeFactory` call — which happens as soon as `ArduinoProjectStore` opens a document, itself
 * triggered from `<App>`'s very first render — so this awaits the one-shot IPC fetch before rendering
 * anything. A fast local read of a handful of small JSON files, so blocking the very first paint on it
 * is a non-issue in practice.
 */
globalThis.falang.drivers
  .list()
  .then((drivers) => {
    initializeDriverRegistry(drivers);
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    reportError('Failed to load driver registry', error);
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
