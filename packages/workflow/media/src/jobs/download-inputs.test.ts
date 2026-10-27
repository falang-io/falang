import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { downloadAndProbeInputs } from './download-inputs.js';
import { FakeProcessSpawner } from './fake-process-spawner.test-utils.js';
import type { IFilesClient } from './files-client.js';
import { createSizeLimiter } from './files-client.js';

const filesClient: IFilesClient = {
  download: (_p, _f, _t, destPath) => writeFile(destPath, 'x'),
  upload: () => Promise.reject(new Error('unused')),
};

const probeSpawner = (json: unknown) =>
  new FakeProcessSpawner((call) =>
    queueMicrotask(() => {
      call.stdout.write(JSON.stringify(json));
      call.finish(0);
    }),
  );

const png = (extra: object = {}, format: object = {}) => ({
  streams: [{ codec_type: 'video', codec_name: 'png', width: 64, height: 64, ...extra }],
  format: { format_name: 'png_pipe', ...format },
});

const run = async (
  spawner: FakeProcessSpawner,
  inputs: { id: string; name: string }[],
  env: NodeJS.ProcessEnv = {},
) => {
  const dir = await mkdtemp(join(tmpdir(), 'media-dl-test-'));
  try {
    return await downloadAndProbeInputs({ filesClient, spawner, config: loadConfig(env) }, 'p', 't', inputs, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('downloadAndProbeInputs limits', () => {
  it('accepts a normal input and probes it with a protocol whitelist', async () => {
    const spawner = probeSpawner(png());
    const result = await run(spawner, [{ id: 'f', name: '../../x/evil.png' }]);
    expect(result[0].path).toMatch(/input-0\.png$/);
    expect(spawner.calls[0].args).toContain('-protocol_whitelist');
  });

  it('rejects too many inputs before downloading', async () => {
    const inputs = Array.from({ length: 11 }, (_, i) => ({ id: `f${i}`, name: 'a.png' }));
    await expect(run(probeSpawner(png()), inputs)).rejects.toThrow(/too many inputs/);
  });

  it('rejects an over-long input', async () => {
    await expect(run(probeSpawner(png({}, { duration: '7200' })), [{ id: 'f', name: 'a.png' }])).rejects.toThrow(
      /too long/,
    );
  });

  it('honours MEDIA_MAX_DURATION_SECONDS', async () => {
    await expect(
      run(probeSpawner(png({}, { duration: '20' })), [{ id: 'f', name: 'a.png' }], {
        MEDIA_MAX_DURATION_SECONDS: '10',
      }),
    ).rejects.toThrow(/too long/);
  });

  it('rejects a huge resolution', async () => {
    await expect(run(probeSpawner(png({ width: 9000 })), [{ id: 'f', name: 'a.png' }])).rejects.toThrow(/resolution/);
  });
});

describe('createSizeLimiter', () => {
  it('fails once the byte budget is exceeded', async () => {
    const limiter = createSizeLimiter(5);
    const done = new Promise((_, reject) => {
      limiter.on('error', reject);
    });
    limiter.write(Buffer.from('1234'));
    limiter.write(Buffer.from('567'));
    await expect(done).rejects.toThrow(/exceeds/);
  });
});
