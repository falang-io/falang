import type { INode } from '@falang/dto';
import { EditorModule, registerGlobalTokens, schemeFactory, HistoryModule, type Scheme } from '@falang/scheme';
import { buildMagicIconsGroup } from '@falang/workflow-scheme/src/magic/magic-icons-group.js';
import { MagicModule } from '@falang/workflow-scheme/src/magic/magic-module.js';
import { getMagicTestInfrastructure } from '@falang/workflow-scheme/src/magic/magic-test-harness.js';

export const actionNode = (id: string, data = ''): INode => ({ id, name: 'action', data });

export const magicNode = (id: string, children: INode[] = [], spell = 'do it', meta?: INode['meta']): INode => ({
  id,
  name: 'magic',
  data: { spell },
  children,
  ...(meta ? { meta } : {}),
});

/** A real scheme (function document, history, `MagicModule`) holding `bodyChildren` in its function body `b`. */
export const buildMagicScheme = (bodyChildren: INode[]): Scheme => {
  registerGlobalTokens();
  return schemeFactory({
    document: {
      id: 'doc',
      name: 'fn',
      root: {
        id: 'root',
        name: 'function',
        children: [
          { id: 'h', name: 'function-header', data: '' },
          { id: 'b', name: 'function-body', data: '', children: bodyChildren },
          { id: 'f', name: 'function-footer', data: '' },
        ],
      },
      type: 'function',
    },
    infra: getMagicTestInfrastructure(buildMagicIconsGroup()),
    modules: [new EditorModule(), new HistoryModule(), new MagicModule()],
  });
};
