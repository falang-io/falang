import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { listTree, readDocument } from '@falang/desktop-project-fs';
import { NodesStack, type INode } from '@falang/dto';
import { getTextGroup } from '@falang/text-dto';
import { convertOldProject } from './convert-project.js';
import { copyFixtureToTmpDir } from './test-utils.js';

const textStack = new NodesStack([getTextGroup()]);

const findNode = (root: INode, id: string): INode | null => {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
};

describe('convertOldProject: timer side icon', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('converts an action\'s leftSide into a valid "timer" mod, keeping id and text', async () => {
    projectDir = await copyFixtureToTmpDir('text-timer');
    await convertOldProject(projectDir);

    const tree = await listTree(projectDir);
    const [entry] = tree.documents;
    const doc = await readDocument(projectDir, entry.id);
    expect(() => textStack.parseDocument(doc)).not.toThrow();
    const root = doc.root;
    if (!root) throw new Error('no root');
    const action = findNode(root, 'TimerAction0000000001');
    expect(action?.mods).toEqual([{ id: 'TimerSide000000000001', name: 'timer', data: '5 minutes' }]);
    expect(findNode(root, 'PlainAction000000000001')?.mods).toBeUndefined();
  });
});
