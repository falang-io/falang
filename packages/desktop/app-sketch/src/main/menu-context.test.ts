import { describe, expect, it } from 'vitest';
import { getMenuContext, getProjectMenuAvailability, setMenuContext } from './menu-context.js';

describe('getProjectMenuAvailability', () => {
  it('offers nothing without a project', () => {
    expect(getProjectMenuAvailability(null)).toEqual({ hasProject: false, logicExport: false, codeExport: false });
  });
  it('offers logic export for a logic project only', () => {
    expect(getProjectMenuAvailability('logic')).toEqual({ hasProject: true, logicExport: true, codeExport: false });
  });
  it('offers code export for simple-code projects only', () => {
    expect(getProjectMenuAvailability('simple-code-rust')).toEqual({
      hasProject: true,
      logicExport: false,
      codeExport: true,
    });
  });
  it('offers no export for a text project', () => {
    expect(getProjectMenuAvailability('text')).toEqual({ hasProject: true, logicExport: false, codeExport: false });
  });
});

describe('setMenuContext', () => {
  it('reports whether the context changed', () => {
    expect(setMenuContext({ projectType: 'logic' })).toBe(true);
    expect(setMenuContext({ projectType: 'logic' })).toBe(false);
    expect(getMenuContext().projectType).toBe('logic');
    expect(setMenuContext({ projectType: null })).toBe(true);
  });
});
