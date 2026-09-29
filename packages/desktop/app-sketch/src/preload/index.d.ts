import type { FalangApi } from './index.js';

declare global {
  interface Window {
    falang: FalangApi;
  }

  // oxlint-disable-next-line no-var
  var falang: FalangApi;
}
