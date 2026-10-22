import { describe, expect, it, vi } from 'vitest';
import { SketchCodeViewerStore } from './sketch-code-viewer-store.js';
import type { TArduinoGeneratedCode } from '../../shared/arduino-sketch-code.js';

const files = [
  { path: 'sketch.ino', content: '#include <Arduino.h>' },
  { path: 'drv.cpp', content: '' },
];

const deferred = <T,>() => {
  const handle: { resolve: ((value: T) => void) | null } = { resolve: null };
  const promise = new Promise<T>((done) => {
    handle.resolve = done;
  });
  return { promise, resolve: (value: T) => handle.resolve?.(value) };
};

describe('SketchCodeViewerStore', () => {
  it('openFresh shows the generated files', async () => {
    const store = new SketchCodeViewerStore(() => Promise.resolve({ ok: true, files }));
    await store.openFresh();
    expect(store.isOpen).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.files).toEqual(files);
    expect(store.problems).toEqual([]);
    expect(store.loadError).toBeNull();
  });

  it('openFresh on a failed compile lists the problems next to the partial code', async () => {
    const problems = [{ documentId: 'd1', documentName: 'loop', nodeId: 'n1', message: 'bad' }];
    const store = new SketchCodeViewerStore(() =>
      Promise.resolve<TArduinoGeneratedCode>({ ok: false, message: 'loop: bad', problems, files: [files[0]] }),
    );
    await store.openFresh();
    expect(store.problems).toEqual(problems);
    expect(store.files).toEqual([files[0]]);
    expect(store.loadError).toBeNull();
  });

  it('openFresh shows the message of a project-level failure (no per-document problems)', async () => {
    const store = new SketchCodeViewerStore(() =>
      Promise.resolve<TArduinoGeneratedCode>({ ok: false, message: 'no setup', problems: [], files: [] }),
    );
    await store.openFresh();
    expect(store.loadError).toBe('no setup');
  });

  it('a slow generate superseded by a build result or a close is ignored', async () => {
    const pending = deferred<TArduinoGeneratedCode>();
    const generate = vi.fn(() => pending.promise);
    const store = new SketchCodeViewerStore(generate);
    const opening = store.openFresh();
    const diagnostics = [{ file: 'sketch.ino', line: 3, severity: 'error' as const, message: 'x' }];
    store.showBuildResult({ files, diagnostics, focus: { path: 'sketch.ino', line: 3 } });
    pending.resolve({ ok: true, files: [] });
    await opening;
    expect(store.files).toEqual(files);
    expect(store.diagnostics).toEqual(diagnostics);
    expect(store.focus).toEqual({ path: 'sketch.ino', line: 3 });
    expect(store.loading).toBe(false);
  });

  it('reports a rejected generate as a load error', async () => {
    const store = new SketchCodeViewerStore(() => Promise.reject(new Error('worker died')));
    await store.openFresh();
    expect(store.loadError).toBe('worker died');
    store.close();
    expect(store.isOpen).toBe(false);
  });
});
