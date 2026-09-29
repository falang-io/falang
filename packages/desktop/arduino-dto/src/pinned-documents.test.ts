import { describe, expect, it } from 'vitest';
import { DEVICES_DOCUMENT_TYPE } from './devices-document.js';
import { isArduinoPinnedDocument } from './pinned-documents.js';

describe('isArduinoPinnedDocument', () => {
  it('pins a root-level "setup"/"loop" function document', () => {
    expect(isArduinoPinnedDocument({ name: 'setup', type: 'function', folderId: null })).toBe(true);
    expect(isArduinoPinnedDocument({ name: 'loop', type: 'function', folderId: null })).toBe(true);
  });

  it('does not pin "setup"/"loop" once moved into a folder', () => {
    expect(isArduinoPinnedDocument({ name: 'setup', type: 'function', folderId: 'folder-1' })).toBe(false);
  });

  it('does not pin an ordinary root-level function document', () => {
    expect(isArduinoPinnedDocument({ name: 'blink', type: 'function', folderId: null })).toBe(false);
  });

  it('always pins the Devices document, regardless of folder', () => {
    expect(isArduinoPinnedDocument({ name: 'Devices', type: DEVICES_DOCUMENT_TYPE, folderId: null })).toBe(true);
    expect(isArduinoPinnedDocument({ name: 'Devices', type: DEVICES_DOCUMENT_TYPE, folderId: 'folder-1' })).toBe(true);
  });
});
