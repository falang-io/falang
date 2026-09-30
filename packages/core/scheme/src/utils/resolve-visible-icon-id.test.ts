import { runInAction } from 'mobx';
import { afterEach, describe, expect, it } from 'vitest';
import { NodesGroup, type INode } from '@falang/dto';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { insertNode } from '../actions/insert-node.js';
import { IconsGroup } from '../scheme/icons-group.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { SchemeInfrastructure } from '../scheme/scheme-infrastructure.js';
import type { Scheme } from '../scheme/scheme.js';
import { BaseIconComponent } from '../cmp/base.icon.cmp.js';
import { SimpleIconStore } from '../icons/simple/simple.icon.js';
import { rectangleShape } from '../shapes/rectangle.js';
import { IconFlags } from '../types/icon-flags.js';
import { resolveVisibleIconId } from './resolve-visible-icon-id.js';
import { checker } from '../checker.js';
import { resolveService } from '@falang/di';
import { observable } from 'mobx';
import { TOKEN_CSS_CLASSES } from '../di-tokens.js';
import {
  ExecutionPositionModule,
  type IExecutionLocation,
} from '../modules/execution-position/execution-position.module.js';

class HidingIconStore extends SimpleIconStore {
  constructor(...args: ConstructorParameters<typeof SimpleIconStore>) {
    super({ ...args[0], flags: IconFlags.HidesChildren });
  }
}

const boxIcons = new IconsGroup(new NodesGroup([{ name: 'box', children: true }]), {
  box: {
    block: { view: () => null },
    icon: { factory: (params) => new HidingIconStore(params), view: BaseIconComponent },
    shape: rectangleShape,
  },
});

const buildInfra = () => {
  const base = getTestInfrastructure();
  return new SchemeInfrastructure([...base.iconsGroups, boxIcons]);
};

describe('resolveVisibleIconId / HidesChildren', () => {
  let scheme: Scheme | null = null;
  afterEach(() => {
    scheme?.dispose();
    scheme = null;
  });

  const build = (children: INode[]) => {
    const doc = getTestEmptyDoc();
    doc.root.children[1].children = children;
    scheme = schemeFactory({ infra: buildInfra(), document: doc });
    return scheme;
  };

  it('creates no icons for the descendants of a hiding icon, yet keeps their nodes', () => {
    const s = build([
      { id: 'box1', name: 'box', children: [{ id: 'inner', name: 'action', data: 'x' }] },
      { id: 'plain', name: 'action', data: 'y' },
    ]);
    expect(checker.hidesChildren(s.icons.getIcon('box1'))).toBe(true);
    expect(s.icons.getIconSafe('inner')).toBeNull();
    expect(s.nodes.getNode('inner').parent?.id).toBe('box1');
    expect(s.icons.getIconSafe('plain')).not.toBeNull();
  });

  it('resolves a hidden descendant to the outermost hiding ancestor, anything else to itself', () => {
    const s = build([
      { id: 'box1', name: 'box', children: [{ id: 'inner', name: 'action', data: 'x' }] },
      { id: 'plain', name: 'action', data: 'y' },
    ]);
    expect(resolveVisibleIconId(s, 'inner')).toBe('box1');
    expect(resolveVisibleIconId(s, 'box1')).toBe('box1');
    expect(resolveVisibleIconId(s, 'plain')).toBe('plain');
    expect(resolveVisibleIconId(s, 'unknown')).toBe('unknown');
  });

  it('inserting into a hiding node works and adds no icon', () => {
    const s = build([{ id: 'box1', name: 'box', children: [] }]);
    runInAction(() => {
      insertNode({ index: 0, parentId: 'box1', node: { id: 'n2', name: 'action', data: 'z' } }, s);
    });
    expect(s.icons.getIconSafe('n2')).toBeNull();
    expect(resolveVisibleIconId(s, 'n2')).toBe('box1');
  });

  it('ExecutionPositionModule highlights the hiding block for a hidden child location', () => {
    const source = observable({ location: null as IExecutionLocation | null });
    const doc = getTestEmptyDoc();
    doc.root.children[1].children = [
      { id: 'box1', name: 'box', children: [{ id: 'inner', name: 'action', data: 'x' }] },
    ] as never;
    scheme = schemeFactory({
      infra: buildInfra(),
      document: doc,
      id: 'doc-a',
      modules: [new ExecutionPositionModule(source, { follow: false })],
    });
    runInAction(() => {
      source.location = { documentId: 'doc-a', nodeId: 'inner' };
    });
    const classes = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    expect(classes.getBlockBodyClassName('box1')).toContain('execution-current');
  });
});
