import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => {
  // oxlint-disable-next-line no-console -- process-lifecycle log, this service has no logging framework yet.
  console.log(`falang-workflow-activepieces listening on :${port}`);
});
