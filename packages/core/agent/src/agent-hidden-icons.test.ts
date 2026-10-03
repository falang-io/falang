import { NodesGroup } from '@falang/dto';
import {
  addFlag,
  BaseIconComponent,
  HistoryModule,
  IconFlags,
  IconsGroup,
  rectangleShape,
  schemeFactory,
  SchemeInfrastructure,
  SimpleIconStore,
  type IIconStoreParams,
} from '@falang/scheme';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { describe, expect, it } from 'vitest';
import { AgentSession } from './agent-session.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

class HidingIconStore extends SimpleIconStore {
  constructor(params: IIconStoreParams) {
    super({ ...params, flags: addFlag(params.flags, IconFlags.HidesChildren) });
  }
}

const boxGroup = new IconsGroup(new NodesGroup([{ name: 'box', children: true }]), {
  box: {
    block: { view: () => null },
    icon: { factory: (params: IIconStoreParams) => new HidingIconStore(params), view: BaseIconComponent },
    shape: rectangleShape,
  },
});

describe('agent edits inside an icon that hides its children', () => {
  it('insert_nodes into a node below the hiding icon focuses the visible block and succeeds', async () => {
    const doc = getTestEmptyDoc();
    doc.root.children[1].children = [
      { id: 'bx', name: 'box', children: [{ id: 'in', name: 'action', data: '' }] },
    ] as never;
    const scheme = schemeFactory({
      document: { ...doc, type: 'function' },
      infra: new SchemeInfrastructure([...getTestInfrastructure().iconsGroups, boxGroup]),
      modules: [new HistoryModule()],
    });
    const client = new ScriptedLlmClient([
      {
        text: '',
        toolCalls: [
          {
            id: 't1',
            name: 'insert_nodes',
            input: { parentId: 'bx', index: 1, node: { name: 'action', data: 'x' } },
          },
        ],
      },
      { text: '', toolCalls: [{ id: 't2', name: 'finish', input: { message: 'done' } }] },
    ]);
    const session = new AgentSession(scheme, client, []);
    await session.run('go', { allowQuestions: false });
    expect(session.steps[0].result.ok).toBe(true);
    expect(scheme.nodes.getNode('bx').children).toHaveLength(2);
    expect(scheme.icons.getIconSafe('in')).toBeNull();
    scheme.dispose();
  });
});
