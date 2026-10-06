import { describe, expect, it } from 'vitest';
import { classifyUndoTarget, matchUndoKey } from './undo-routing.js';

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...mods,
});

describe('classifyUndoTarget', () => {
  it('targets the scheme with nothing or a non-text element focused', () => {
    expect(classifyUndoTarget(null)).toBe('scheme');
    expect(classifyUndoTarget({ tagName: 'BODY' })).toBe('scheme');
    expect(classifyUndoTarget({ tagName: 'BUTTON' })).toBe('scheme');
    expect(classifyUndoTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe('scheme');
  });
  it('targets native text controls', () => {
    expect(classifyUndoTarget({ tagName: 'INPUT', type: 'text' })).toBe('native');
    expect(classifyUndoTarget({ tagName: 'INPUT' })).toBe('native');
    expect(classifyUndoTarget({ tagName: 'TEXTAREA' })).toBe('native');
    expect(classifyUndoTarget({ tagName: 'DIV', isContentEditable: true })).toBe('native');
  });
  it('targets Monaco before anything else (its hidden input is a textarea)', () => {
    expect(classifyUndoTarget({ tagName: 'TEXTAREA', closest: (s) => (s === '.monaco-editor' ? {} : null) })).toBe(
      'monaco',
    );
  });
});

describe('matchUndoKey', () => {
  it('maps Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y on non-mac', () => {
    expect(matchUndoKey(ev('z', { ctrlKey: true }), false)).toBe('undo');
    expect(matchUndoKey(ev('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(matchUndoKey(ev('y', { ctrlKey: true }), false)).toBe('redo');
    expect(matchUndoKey(ev('z', { metaKey: true }), false)).toBeNull();
  });
  it('maps Cmd+Z / Cmd+Shift+Z on mac, not Ctrl+Y', () => {
    expect(matchUndoKey(ev('z', { metaKey: true }), true)).toBe('undo');
    expect(matchUndoKey(ev('z', { metaKey: true, shiftKey: true }), true)).toBe('redo');
    expect(matchUndoKey(ev('y', { ctrlKey: true }), true)).toBeNull();
  });
  it('ignores handled events and unrelated keys', () => {
    expect(matchUndoKey({ ...ev('z', { ctrlKey: true }), defaultPrevented: true }, false)).toBeNull();
    expect(matchUndoKey(ev('z'), false)).toBeNull();
    expect(matchUndoKey(ev('z', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });
});
