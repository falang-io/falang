// Test-only worker entry for `build-worker-pool.test.ts`: behaves according to `job.workflows`.
process.once('message', (job: { workflows: string }) => {
  if (job.workflows === 'hang') {
    setInterval(Boolean, 1000);
    return;
  }
  if (job.workflows === 'crash') {
    process.exit(3);
  }
  if (job.workflows === 'env') {
    process.send?.({ ok: true, result: { kind: 'errors', errors: [{ documentId: '', documentName: JSON.stringify(process.env), message: '' }] } });
    return;
  }
  // 'slow': hold the slot for a while, report when we started/finished.
  const startedAt = Date.now();
  setTimeout(() => {
    process.send?.({
      ok: true,
      result: { kind: 'errors', errors: [{ documentId: String(startedAt), documentName: String(Date.now()), message: '' }] },
    });
  }, 700);
});
