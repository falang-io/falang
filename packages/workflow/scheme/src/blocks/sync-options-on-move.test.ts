import { NodesGroup, switchCfg, zod, type IDataInfo, type INode } from '@falang/dto';
import {
  CMD_MOVE_NODES,
  HistoryModule,
  IconsGroup,
  rectangleShape,
  registerGlobalTokens,
  schemeFactory,
  simpleIconConfig,
  TOKEN_HISTORY,
  type Scheme,
} from '@falang/scheme';
import { resolveService } from '@falang/di';
import { afterEach, describe, expect, it } from 'vitest';
import { getMagicTestInfrastructure } from '../magic/magic-test-harness.js';
import type { IntegrationsRegistryStore } from '../registry/integrations-registry.store.js';
import { registerOptionsSyncOnMove } from './sync-options-on-move.js';

const headerType = {
  type: zod.object({ options: zod.array(zod.any()) }).passthrough(),
  default: () => ({ options: [] }),
} as const satisfies IDataInfo;
const optionType = { type: zod.any(), default: () => ({}) } as const satisfies IDataInfo;

const optionsIconsGroup = () => {
  const nodes = new NodesGroup([
    ...switchCfg({ name: 'ask', data: headerType, optionData: optionType }),
    ...switchCfg({ name: 'pick', data: headerType, optionData: optionType }),
  ]);
  const common = { block: { view: () => null }, icon: simpleIconConfig, shape: rectangleShape };
  return new IconsGroup(nodes, { ask: common, 'ask-option': common, pick: common, 'pick-option': common });
};

const registry = {
  findQuestion: (name: string) => (name === 'ask' ? {} : undefined),
  findChoice: (name: string) => (name === 'pick' ? {} : undefined),
} as unknown as IntegrationsRegistryStore;

const askOption = (id: string, label: string, fixed = false): INode => ({
  id,
  name: 'ask-option',
  data: fixed ? { label, fixed } : { label },
  children: [],
});
const pickOption = (id: string, alias: string): INode => ({
  id,
  name: 'pick-option',
  data: { alias, dataType: 'void', variable: 'choice' },
  children: [],
});

const buildDoc = (bodyChildren: INode[]) => ({
  id: 'doc',
  type: 'function',
  name: 'function-doc',
  root: {
    id: 'root',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: '', children: bodyChildren },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  },
});

describe('registerOptionsSyncOnMove', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  afterEach(() => scheme?.dispose());

  const build = (bodyChildren: INode[]) => {
    registerGlobalTokens();
    scheme = schemeFactory({
      infra: getMagicTestInfrastructure(optionsIconsGroup() as unknown as IconsGroup),
      document: buildDoc(bodyChildren),
      modules: [new HistoryModule()],
    });
    registerOptionsSyncOnMove(scheme, registry);
    return scheme;
  };
  const move = (parentId: string, indexStart: number, insertIndex: number) =>
    scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
      oldParentId: parentId,
      newParentId: parentId,
      indexStart,
      length: 1,
      insertIndex,
    });
  const data = (id: string) => scheme.nodes.getNode(id).data as { options: unknown[] };

  it("rewrites a question's option labels in the dragged order, as one undo step", () => {
    build([
      {
        id: 'q',
        name: 'ask',
        data: { options: ['Yes', 'No', 'Maybe'] },
        children: [askOption('o1', 'Yes'), askOption('o2', 'No'), askOption('o3', 'Maybe')],
      },
    ]);
    move('q', 0, 3);
    expect(scheme.nodes.getNode('q').children.map((child) => child.id)).toEqual(['o2', 'o3', 'o1']);
    expect(data('q').options).toEqual(['No', 'Maybe', 'Yes']);

    resolveService(TOKEN_HISTORY, scheme.container).back();
    expect(scheme.nodes.getNode('q').children.map((child) => child.id)).toEqual(['o1', 'o2', 'o3']);
    expect(data('q').options).toEqual(['Yes', 'No', 'Maybe']);
  });

  it("leaves the fixed timeout option out of a question's labels and refuses to move it off the tail", () => {
    build([
      {
        id: 'q',
        name: 'ask',
        data: { options: ['Yes', 'No'] },
        children: [askOption('o1', 'Yes'), askOption('o2', 'No'), askOption('t', 'timeout', true)],
      },
    ]);
    move('q', 1, 0);
    expect(data('q').options).toEqual(['No', 'Yes']);

    move('q', 2, 0);
    expect(scheme.nodes.getNode('q').children.map((child) => child.id)).toEqual(['o2', 'o1', 't']);
  });

  it("keeps a choice's whole option records in the dragged order", () => {
    build([
      {
        id: 'c',
        name: 'pick',
        data: { options: [{ alias: 'A' }, { alias: 'B' }] },
        children: [pickOption('a', 'A'), pickOption('b', 'B')],
      },
    ]);
    move('c', 1, 0);
    expect((data('c').options as { alias: string }[]).map((option) => option.alias)).toEqual(['B', 'A']);
  });

  it('does not touch moves elsewhere', () => {
    build([
      { id: 'x', name: 'action', data: 'x' },
      { id: 'y', name: 'action', data: 'y' },
    ]);
    move('b', 0, 2);
    expect(scheme.nodes.getNode('b').children.map((child) => child.id)).toEqual(['y', 'x']);
  });
});
