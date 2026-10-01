import type { INode, IProjectDocument } from '@falang/dto';
import { collectIntegrationActivityCode } from '@falang/workflow-compiler';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { assertSafeGeneratedModules } from './assert-safe-generated-modules.js';
import { compileProjectStructure } from './compile-project-documents.js';

const messages = (workflows: string, activities = ''): string[] =>
  assertSafeGeneratedModules(workflows, activities).map((error) => error.message);

describe('assertSafeGeneratedModules', () => {
  it('accepts every import the compiler and every registered vendor actually emit', () => {
    const activities = collectIntegrationActivityCode(REGISTERED_INTEGRATIONS).join('\n');
    expect(activities).toContain('@temporalio/activity');
    expect(assertSafeGeneratedModules("import { proxyActivities } from '@temporalio/workflow';\nexport const x = 1;", activities)).toEqual([]);
  });

  it.each([
    ['relative static import', "import { s } from './other-secret';"],
    ['parent-directory import', "import { s } from '../other-project/workflows';"],
    ['absolute import', "import raw from '/etc/hostname';"],
    ['webpack loader specifier', "import x from '!!raw-loader!./x';"],
    ['query specifier', "import x from '@temporalio/workflow?raw';"],
    ['foreign package', "import fs from 'node:fs';"],
    ['side-effect import', "import '/etc/hostname';"],
    ['re-export from a foreign specifier', "export * from './other-secret';"],
    ['named re-export from a foreign specifier', "export { s } from 'fs';"],
    ['import-equals require', "import fsx = require('node:fs');"],
    ['require call', "const s = require('fs').readFileSync('/etc/hostname', 'utf8');"],
    ['require alias', 'const r = require;'],
    ['webpack require', 'const c = __webpack_require__;'],
    ['dynamic import of a foreign specifier', "const s = await import('node:fs');"],
    ['dynamic import of a computed specifier', "const s = await import('no' + 'de:fs');"],
    ['dynamic import with options', "const s = await import('pg', { with: { type: 'json' } });"],
    ['import.meta', 'const u = import.meta.url;'],
    ['type-level import', "type T = typeof import('/etc/hostname');"],
    ['triple-slash path reference', "/// <reference path='/etc/hostname' />\nexport const a = 1;"],
    ['triple-slash types reference', "/// <reference types='node' />\nexport const a = 1;"],
    ['triple-slash directive in the middle of the file', "export const a = 1;\n/// <reference lib='dom' />\n"],
  ])('rejects %s', (_name, source) => {
    expect(messages(source).length).toBeGreaterThan(0);
    expect(messages('export const a = 1;', source).length).toBeGreaterThan(0);
  });

  it('allows a literal dynamic import of an allowlisted driver', () => {
    expect(messages("const pg = await import('pg');\nconst my = await import('mysql2/promise');")).toEqual([]);
  });

  it('attributes a violation inside a document to that document and node', () => {
    const workflows = [
      '// doc-start:run:doc-1',
      'export async function run() {',
      '  // icon-start:action:a1',
      "  const s = require('fs');",
      '  // icon-end:action:a1',
      '}',
      '// doc-end:run:doc-1',
    ].join('\n');
    const [error] = assertSafeGeneratedModules(workflows, '');
    expect(error).toMatchObject({ documentId: 'doc-1', documentName: 'run', nodeId: 'a1' });
  });
});

const functionDocument = (actionData: string): IProjectDocument => {
  const root: INode = {
    id: 'doc-1',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: { parameters: [] }, children: [{ id: 'a1', name: 'action', data: actionData }] },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  };
  return { id: 'doc-1', type: 'function', name: 'run', root };
};

describe('compileProjectStructure — tenant text cannot smuggle module loads into the build', () => {
  it('accepts an ordinary expression', () => {
    expect(compileProjectStructure([functionDocument('const value = 1 + 2')], [])).toBeDefined();
  });

  it.each([
    ['closing the function and adding a top-level import', "0;\n}\nimport * as leak from '../../.builds/other/workflows';\nasync function zzz() {\n"],
    ['a dynamic import inside the statement', "await import('../../.builds/other/workflows')"],
    ['require', "require('fs')"],
    ['a triple-slash reference after a break-out', "0;\n}\n/// <reference path='/etc/hostname' />\nasync function zzz() {\n"],
  ])('rejects %s with a 400 naming the document', (_name, actionData) => {
    const thrown = ((): unknown => {
      try {
        compileProjectStructure([functionDocument(actionData)], []);
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(thrown).toBeInstanceOf(BadRequestException);
    const body = (thrown as BadRequestException).getResponse() as { errors: { documentName: string; message: string }[]; files: unknown[] };
    expect(body.errors[0].documentName).toBe('run');
    expect(body.files).toHaveLength(2);
  });
});
