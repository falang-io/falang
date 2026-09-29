import { describe, expect, it } from 'vitest';
import { execFileAsync } from './exec-file-async.js';

describe('execFileAsync', () => {
  it('resolves ok with stdout for a real successful process', async () => {
    const result = await execFileAsync(process.execPath, ['-e', "process.stdout.write('hello')"]);

    expect(result).toEqual({ ok: true, stdout: 'hello', stderr: '' });
  });

  it('resolves not-ok with stderr and an error message for a real failing process', async () => {
    const result = await execFileAsync(process.execPath, ['-e', "process.stderr.write('boom'); process.exit(1)"]);

    expect(result.ok).toBe(false);
    expect(result.stderr).toBe('boom');
    expect(result.errorMessage).toBeTruthy();
  });

  it('resolves not-ok with an error message when the binary itself does not exist', async () => {
    const result = await execFileAsync('this-binary-does-not-exist', []);

    expect(result.ok).toBe(false);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.errorMessage).toContain('this-binary-does-not-exist');
  });
});
