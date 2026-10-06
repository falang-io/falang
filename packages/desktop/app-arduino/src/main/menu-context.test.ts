import { describe, expect, it } from 'vitest';
import { getMenuContext, hasOpenProject, setMenuContext } from './menu-context.js';

describe('menu context', () => {
  it('tracks the open project and reports changes', () => {
    expect(hasOpenProject(getMenuContext())).toBe(false);
    expect(setMenuContext({ projectType: 'arduino' })).toBe(true);
    expect(setMenuContext({ projectType: 'arduino' })).toBe(false);
    expect(hasOpenProject(getMenuContext())).toBe(true);
    expect(setMenuContext({ projectType: null })).toBe(true);
    expect(hasOpenProject(getMenuContext())).toBe(false);
  });
});
