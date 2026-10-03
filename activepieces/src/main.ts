import { createApp } from './app.js';
import { installEgress } from './egress/index.js';

// Platform egress proxy routing (ADR 0056 (private)): fetch via undici's dispatcher, axios via the http(s) global agents.
installEgress();

const app = createApp();
const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => {
  // oxlint-disable-next-line no-console -- process-lifecycle log, this service has no logging framework yet.
  console.log(`falang-workflow-activepieces listening on :${port}`);
});
