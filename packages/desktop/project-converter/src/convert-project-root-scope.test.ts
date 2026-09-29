import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listTree, readDocument } from '@falang/desktop-project-fs';
import {
  enumStructureNodes,
  externalApiStructureNodes,
  functionNodesGroup,
  objectStructureNodes,
} from '@falang/typescript-dto';
import { NodesStack, type INode, type IProjectDocument } from '@falang/dto';
import { convertOldProject } from './convert-project.js';
import { isOldFormatProject } from './detect.js';
import { copyFixtureToTmpDir } from './test-utils.js';

const logicStack = new NodesStack([
  functionNodesGroup,
  objectStructureNodes,
  externalApiStructureNodes,
  enumStructureNodes,
]);

const expectAllDocumentsValid = async (projectDir: string, stack: NodesStack): Promise<void> => {
  const tree = await listTree(projectDir);
  const documents: IProjectDocument[] = await Promise.all(
    tree.documents.map((entry) => readDocument(projectDir, entry.id)),
  );
  for (const document of documents) {
    expect(() => stack.parseNode(document.root as INode), `document "${document.name}"`).not.toThrow();
  }
};

const addNonFalangHostFiles = async (projectDir: string): Promise<void> => {
  await fs.writeFile(path.join(projectDir, 'README.md'), 'hand-written host project readme');
  await fs.mkdir(path.join(projectDir, 'code', 'ts'), { recursive: true });
  await fs.writeFile(path.join(projectDir, 'code', 'ts', 'index.ts'), 'export {};');
};

const expectNonFalangHostFilesUntouched = async (projectDir: string): Promise<void> => {
  expect(await fs.readFile(path.join(projectDir, 'README.md'), 'utf8')).toBe('hand-written host project readme');
  expect(await fs.readFile(path.join(projectDir, 'code', 'ts', 'index.ts'), 'utf8')).toBe('export {};');
};

/**
 * Covers `convertOldProject`'s promise that it only ever touches its own falang-owned entries at
 * the project root — every non-falang entry (the user's own `code/`, README, …) stays exactly where
 * it was, on both a successful conversion and a rolled-back one. Split out of `convert-project.test.ts`
 * to keep that file under the repo's `max-lines` lint budget.
 */
describe('convertOldProject — project-root scope', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('leaves non-falang entries at the project root untouched after a successful conversion', async () => {
    projectDir = await copyFixtureToTmpDir('objects');
    await addNonFalangHostFiles(projectDir);

    await convertOldProject(projectDir);

    await expectNonFalangHostFilesUntouched(projectDir);
    const rootEntries = await fs.readdir(projectDir);
    expect(rootEntries).toEqual(expect.arrayContaining(['README.md', 'code', 'backup', 'falang.json', 'falang']));
  });

  it('leaves non-falang entries at the project root untouched on rollback', async () => {
    projectDir = await copyFixtureToTmpDir('conditions');
    await addNonFalangHostFiles(projectDir);

    const brokenDocPath = path.join(projectDir, 'falang', 'schemas', 'TestBreak.falang.json');
    const broken = JSON.parse(await fs.readFile(brokenDocPath, 'utf8')) as { root: { block?: { name?: string } } };
    delete broken.root.block?.name;
    await fs.writeFile(brokenDocPath, JSON.stringify(broken));

    await expect(convertOldProject(projectDir)).rejects.toThrow(/TestBreak/);

    expect(await isOldFormatProject(projectDir)).toBe(true);
    expect(await fs.readdir(projectDir)).not.toContain('backup');
    await expectNonFalangHostFilesUntouched(projectDir);
  });

  it('converts the real-world "snake-v2" fixture end to end (12 documents, ts+rust export config, code/ left in place)', async () => {
    projectDir = await copyFixtureToTmpDir('snake-v2');

    await convertOldProject(projectDir);

    await expectAllDocumentsValid(projectDir, logicStack);
    const tree = await listTree(projectDir);
    expect(tree.documents).toHaveLength(12);
    const byName = new Map(tree.documents.map((d) => [d.name, d.type]));
    expect(byName.get('main')).toBe('function');
    expect(byName.get('clearScreen')).toBe('function');
    expect(byName.get('drawSnakeSquare')).toBe('function');
    expect(byName.get('DrawFood')).toBe('function');
    expect(byName.get('DrawPoints')).toBe('function');
    expect(byName.get('getColors')).toBe('function');
    expect(byName.get('getNewFoodPoint')).toBe('function');
    expect(byName.get('getNextPoint')).toBe('function');
    expect(byName.get('getRandomPoint')).toBe('function');
    expect(byName.get('isGameOver')).toBe('function');
    expect(byName.get('GameApi')).toBe('external-api-structure');
    expect(byName.get('State')).toBe('objects-structure');

    const logicExportRaw = await fs.readFile(path.join(projectDir, 'falang', 'config', 'logic-export.json'), 'utf8');
    expect(JSON.parse(logicExportRaw)).toEqual({
      exports: [
        { language: 'ts', path: './code/ts/src/falang' },
        { language: 'rust', path: './code/rust/src/falang' },
      ],
    });

    // The user's own hand-written host project stays exactly where it was.
    expect(await fs.readdir(path.join(projectDir, 'code'))).toEqual(['.gitkeep']);
    expect(
      await fs.access(path.join(projectDir, 'README.md')).then(
        () => true,
        () => false,
      ),
    ).toBe(true);
  });
});
