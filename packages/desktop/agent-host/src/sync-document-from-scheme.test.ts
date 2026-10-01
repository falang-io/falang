import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CMD_INSERT_NODE, createINodeByName, registerGlobalTokens } from '@falang/scheme';
import type { INode } from '@falang/dto';
import { buildSketchDocumentScheme } from './sketch/build-sketch-document-scheme.js';
import { createSketchProjectContainer } from './sketch/create-sketch-project-container.js';
import { subscribeDesktopDocumentSync, syncDesktopDocumentFromScheme } from './sync-document-from-scheme.js';

describe('desktop document sync', () => {
  it('sets doc.root from the live tree on every change and reports it to onSynced', () => {
    registerGlobalTokens();
    const doc: { id: string; name: string; type: 'simple-code-ts'; root?: INode } = {
      id: 'd',
      name: 'Main',
      type: 'simple-code-ts',
    };
    const scheme = buildSketchDocumentScheme({ doc, parentContainer: createSketchProjectContainer('simple-code-ts') });
    try {
      expect(syncDesktopDocumentFromScheme({}, scheme)).not.toBeNull();
      const synced: INode[] = [];
      subscribeDesktopDocumentSync(doc, scheme, { onSynced: (root) => synced.push(root) });
      const body = scheme.rootNode?.children.find((child) => child.name.endsWith('function-body'));
      if (!body) throw new Error('no body');
      const action = createINodeByName('action', scheme);
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 0, node: action, parentId: body.id });
      expect(synced.length).toBeGreaterThan(0);
      expect(JSON.stringify(doc.root)).toContain(action.id);
    } finally {
      scheme.dispose();
    }
  });
});
