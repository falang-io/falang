import { describe, expect, it } from 'vitest';
import { installFakeMonaco } from '../../field-check/fake-monaco.test-util.js';
import { CodeModelStore } from './code-model.store.js';

const monaco = installFakeMonaco();

describe('CodeModelStore validation errors', () => {
  it('exposes the first error marker message and clears it with the markers', () => {
    const store = new CodeModelStore({ id: 'node', name: 'field', value: 'missing' });
    expect(store.error).toBeNull();

    monaco.setMarkers(
      [
        { severity: store.monaco.MarkerSeverity.Error, message: "Cannot find name 'missing'." },
        { severity: store.monaco.MarkerSeverity.Error, message: 'Second error' },
      ],
      store.fileName,
    );
    expect(store.error).toBe("Cannot find name 'missing'.");
    expect(store.hasErrors).toBe(true);

    monaco.setMarkers([], store.fileName);
    expect(store.error).toBeNull();
    expect(store.hasErrors).toBe(false);
    store.dispose();
  });

  it('ignores non-error markers and errors of an allowed empty value', () => {
    const store = new CodeModelStore({ id: 'node', name: 'field', value: '', allowEmpty: true });
    monaco.setMarkers([{ severity: 4, message: 'Warning' }], store.fileName);
    expect(store.error).toBeNull();

    monaco.setMarkers([{ severity: store.monaco.MarkerSeverity.Error, message: 'Error' }], store.fileName);
    expect(store.error).toBeNull();
    expect(store.hasErrors).toBe(false);

    store.setValue('value');
    expect(store.error).toBe('Error');
    expect(store.hasErrors).toBe(true);
    store.dispose();
  });
});
