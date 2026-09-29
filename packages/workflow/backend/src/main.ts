// oxlint-disable no-console
import { startApp } from './create-app.js';

startApp().catch((error: unknown) => {
  console.error('@falang/workflow-backend failed to start:', error);
  process.exitCode = 1;
});
