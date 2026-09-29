// oxlint-disable no-console
import { startMocksServer } from './server.js';

const port = Number(process.env.PORT ?? 4100);
startMocksServer({ port }).then(
  () => {
    console.log(`@falang/workflow-mocks listening on :${port}`);
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
