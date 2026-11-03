import { WORKFLOW_DAYJS_PLUGINS } from '@falang/workflow-compiler';
import { describe, expect, it } from 'vitest';
import { buildDayjsMonacoLibs, DAYJS_PLUGIN_DECLARATIONS } from './dayjs-monaco-libs.js';

describe('dayjs Monaco libs', () => {
  it('declares exactly the plugins the compiler extends dayjs with', () => {
    expect(Object.keys(DAYJS_PLUGIN_DECLARATIONS).toSorted()).toEqual([...WORKFLOW_DAYJS_PLUGINS].toSorted());
  });

  it('serves the real declaration files where module resolution finds them', () => {
    const libs = buildDayjsMonacoLibs();
    expect(libs['file:///node_modules/dayjs/index.d.ts']).toContain('declare function dayjs');
    expect(libs['file:///node_modules/dayjs/plugin/timezone.d.ts']).toContain("declare module 'dayjs'");
    expect(libs['file:///falang-workflow-globals.d.ts']).toContain("typeof import('dayjs')");
  });
});
