import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';
import { WORKFLOW_DAYJS_MODULE_SPECIFIERS, usesDayjs } from './dayjs-runtime.js';

const functionDocument = (body: INode[]): IProjectDocument => ({
  id: 'doc-1',
  type: 'function',
  name: 'run',
  root: {
    id: 'doc-1',
    name: 'function',
    children: [
      { id: 'doc-1-header', name: 'function-header', data: '' },
      { id: 'doc-1-body', name: 'function-body', data: { parameters: [] }, children: body },
      { id: 'doc-1-footer', name: 'function-footer', data: '' },
    ],
  },
});

describe('dayjs runtime', () => {
  it('imports and extends dayjs when a document uses it', () => {
    const compiled = compileProject({
      documents: [functionDocument([{ id: 'a1', name: 'action', data: "const d = dayjs().tz('Europe/Moscow')" }])],
    });
    expect(compiled.workflows).toContain("import dayjs from 'dayjs';");
    expect(compiled.workflows).toContain("import __falangDayjsTimezone from 'dayjs/plugin/timezone';");
    expect(compiled.workflows).toContain("import 'dayjs/locale/ru';");
    expect(compiled.workflows.indexOf('dayjs.extend(__falangDayjsUtc);')).toBeLessThan(
      compiled.workflows.indexOf('dayjs.extend(__falangDayjsTimezone);'),
    );
    const specifiers = [...compiled.workflows.matchAll(/from '(dayjs[^']*)'|import '(dayjs[^']*)'/g)].map(
      (match) => match[1] ?? match[2],
    );
    expect(specifiers.toSorted()).toEqual([...WORKFLOW_DAYJS_MODULE_SPECIFIERS].toSorted());
  });

  it('emits nothing when no document mentions dayjs', () => {
    const compiled = compileProject({
      documents: [functionDocument([{ id: 'a1', name: 'action', data: 'const x = 1' }])],
    });
    expect(compiled.workflows).not.toContain('dayjs');
  });

  it('matches the identifier only as a whole word', () => {
    expect(usesDayjs('dayjs()')).toBe(true);
    expect(usesDayjs('const myDayjsValue = 1; dayjsLike()')).toBe(false);
  });
});
