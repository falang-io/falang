// `vitest-monocart-coverage`, minus V8 entries for modules that don't exist on disk.
//
// Some tests compile code from memory under a made-up filename (e.g. `transpile-activities-to-cjs.test.ts`
// loads the generated activities as `__test-activities__.js` through `Module._compile`). V8 reports such a
// script like any other, the provider asks Vite to transform that path to recover its source, Vite rejects
// with ERR_LOAD_URL, and the unhandled rejection aborts the whole unit coverage report. Those modules have no
// source of ours to attribute coverage to, so they are dropped before the provider sees them. See ADR 0012
// (private).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import monocart from 'vitest-monocart-coverage';

const existsOnDisk = (entry) => {
  if (entry.source) return true;
  const url = String(entry.url ?? '');
  if (url.startsWith('file://')) return fs.existsSync(fileURLToPath(url));
  return !url.startsWith('/') || fs.existsSync(url);
};

export default {
  async getProvider() {
    const provider = await monocart.getProvider();
    const onAfterSuiteRun = provider.onAfterSuiteRun.bind(provider);
    provider.onAfterSuiteRun = (meta) => {
      const result = meta?.coverage?.result;
      if (Array.isArray(result) && meta.environment !== '__browser__') {
        meta.coverage.result = result.filter((entry) => existsOnDisk(entry));
      }
      return onAfterSuiteRun(meta);
    };
    return provider;
  },
};
