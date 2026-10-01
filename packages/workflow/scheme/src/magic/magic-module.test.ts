// oxlint-disable max-lines
import { resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  CMD_DELETE_NODE,
  CMD_ICON_MOUSE_DOUBLE_CLICK,
  CMD_INSERT_NODE,
  CMD_MOVE_NODES,
  CMD_SET_DATA,
  CMD_SET_META,
  CMD_SET_OUT,
  ContextMenuModule,
  EditorModule,
  HistoryModule,
  registerGlobalTokens,
  schemeFactory,
  TOKEN_CONTEXT_MENU,
  TOKEN_HISTORY,
  TOKEN_INLINE_EDITOR_SERVICE,
  ValencePointsModule,
  type Scheme,
} from '@falang/scheme';
import { getMagicTestInfrastructure } from './magic-test-harness.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_MAGIC_HOST, type IMagicHost } from './magic-host.js';
import { buildMagicIconsGroup } from './magic-icons-group.js';
import { MagicModule } from './magic-module.js';
import type { MagicSpellEditorStore } from './magic-spell-editor.store.js';

const action = (id: string, data = ''): INode => ({ id, name: 'action', data });
const magic = (id: string, children: INode[] = [], spell = 'do it', extra: Partial<INode> = {}): INode => ({
  id,
  name: 'magic',
  data: { spell },
  children,
  ...extra,
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

const makeHost = (overrides: Partial<IMagicHost> = {}) => {
  const host = {
    getStatus: vi.fn(() => 'idle' as const),
    openEditor: vi.fn(),
    onSpellCommitted: vi.fn(),
    ...overrides,
  } satisfies IMagicHost;
  return host;
};

describe('MagicModule', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  const build = (bodyChildren: INode[], host?: IMagicHost) => {
    registerGlobalTokens();
    scheme = schemeFactory({
      infra: getMagicTestInfrastructure(buildMagicIconsGroup()),
      document: buildDoc(bodyChildren),
      modules: [
        new EditorModule(),
        new ValencePointsModule(),
        new ContextMenuModule(),
        new HistoryModule(),
        new MagicModule(),
      ],
    });
    if (host) scheme.container.registerInstance(TOKEN_MAGIC_HOST, host);
    return scheme;
  };
  const bodyIds = () => scheme.nodes.getNode('b').children.map((c) => `${c.name}:${c.id}`);
  const history = () => resolveService(TOKEN_HISTORY, scheme.container);
  const editor = () => resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);

  afterEach(() => scheme?.dispose());

  describe('a document with a magic node with children', () => {
    beforeEach(() => {
      build([action('a1'), magic('m', [action('x1'), action('x2')]), action('a2')]);
    });

    it('draws only the magic block, keeps the children as nodes, builds valence points and selection', () => {
      expect(scheme.icons.getIconSafe('m')).not.toBeNull();
      expect(scheme.icons.getIconSafe('x1')).toBeNull();
      expect(scheme.nodes.getNode('x1').parent?.id).toBe('m');
      expect(
        resolveService(TOKEN_CONTEXT_MENU, scheme.container).buildForIcon({ scheme, icon: scheme.icons.getIcon('m') }),
      ).toBeTruthy();
      expect(() => scheme.icons.all.forEach((icon) => icon.height)).not.toThrow();
    });

    it('deleting the magic node removes the block and its steps from the tree', () => {
      scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: 'm' });
      expect(bodyIds()).toEqual(['action:a1', 'action:a2']);
      expect(scheme.icons.getIconSafe('m')).toBeNull();
      history().back();
      expect(bodyIds()).toEqual(['action:a1', 'magic:m', 'action:a2']);
    });
  });

  describe('double click', () => {
    it('opens the host editor and stops the default inline edit', () => {
      const host = makeHost();
      build([magic('m')], host);
      const stopPropagation = vi.fn();
      const handled = scheme.commands.dispatchCommand(CMD_ICON_MOUSE_DOUBLE_CLICK, {
        e: { stopPropagation } as never,
        icon: scheme.icons.getIcon('m'),
      });
      expect(handled).toBe(true);
      expect(host.openEditor).toHaveBeenCalledWith('m');
      expect(editor().editingId).toBeNull();
    });

    it('falls back to inline editing with no host', () => {
      build([magic('m')]);
      scheme.commands.dispatchCommand(CMD_ICON_MOUSE_DOUBLE_CLICK, {
        e: { stopPropagation: vi.fn() } as never,
        icon: scheme.icons.getIcon('m'),
      });
      expect(editor().editingId).toBe('m');
    });
  });

  describe('a freshly inserted magic node', () => {
    const insertFresh = () => {
      const node = scheme.infra.structure.factory('magic');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: 'b', index: 1, node });
      return node.id;
    };

    it('starts inline editing at once', () => {
      build([action('a1'), action('a2')], makeHost());
      const id = insertFresh();
      expect(editor().editingId).toBe(id);
    });

    it('becomes a plain action when the first edit ends empty', () => {
      build([action('a1'), action('a2')], makeHost());
      const id = insertFresh();
      (editor().editingStore as MagicSpellEditorStore).setSpell('   ');
      editor().stopEdit(scheme, true);
      const names = scheme.nodes.getNode('b').children.map((c) => c.name);
      expect(names).toEqual(['action', 'action', 'action']);
      expect(scheme.nodes.getNodeSafe(id)).toBeNull();
    });

    it('becomes a plain action on Escape even after typing', () => {
      const host = makeHost();
      build([action('a1'), action('a2')], host);
      insertFresh();
      const store = editor().editingStore as MagicSpellEditorStore;
      store.setSpell('something');
      store.cancel();
      editor().stopEdit(scheme, true);
      expect(scheme.nodes.getNode('b').children.map((c) => c.name)).toEqual(['action', 'action', 'action']);
      expect(host.onSpellCommitted).not.toHaveBeenCalled();
    });

    it('keeps the node and tells the host on a non-empty commit', () => {
      const host = makeHost();
      build([action('a1'), action('a2')], host);
      const id = insertFresh();
      (editor().editingStore as MagicSpellEditorStore).setSpell('send a greeting');
      editor().stopEdit(scheme, true);
      expect(scheme.nodes.getNode(id).data).toEqual({ spell: 'send a greeting' });
      expect(host.onSpellCommitted).toHaveBeenCalledWith(id, '', 'send a greeting');
    });
  });

  describe('editing the spell of an existing node', () => {
    it('reports prev/next once for a changed value, nothing for unchanged or cancelled', () => {
      const host = makeHost();
      build([magic('m', [action('x')], 'old')], host);
      const icon = scheme.icons.getIcon('m');
      editor().setIconForEdit(icon, scheme);
      editor().stopEdit(scheme, true);
      expect(host.onSpellCommitted).not.toHaveBeenCalled();

      editor().setIconForEdit(icon, scheme);
      const store = editor().editingStore as MagicSpellEditorStore;
      store.setSpell('new');
      store.cancel();
      editor().stopEdit(scheme, true);
      expect(host.onSpellCommitted).not.toHaveBeenCalled();
      expect(scheme.nodes.getNode('m').data).toEqual({ spell: 'old' });

      editor().setIconForEdit(icon, scheme);
      (editor().editingStore as MagicSpellEditorStore).setSpell('new');
      editor().stopEdit(scheme, true);
      expect(host.onSpellCommitted).toHaveBeenCalledTimes(1);
      expect(host.onSpellCommitted).toHaveBeenCalledWith('m', 'old', 'new');
      expect(scheme.nodes.getNode('m').data).toEqual({ spell: 'new' });
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();
    });
  });

  describe('meta.handEdited', () => {
    it('is set by an edit inside the magic node, in the same undo step', () => {
      build([magic('m', [action('x')])], makeHost());
      scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'x', data: 'changed' });
      expect(scheme.nodes.getNode('m').meta.handEdited).toBe(true);
      expect(scheme.nodes.getNode('x').data).toBe('changed');
      history().back();
      expect(scheme.nodes.getNode('x').data).toBe('');
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();
      history().forward();
      expect(scheme.nodes.getNode('m').meta.handEdited).toBe(true);
      expect(scheme.nodes.getNode('x').data).toBe('changed');
    });

    it('is set by insert, delete and move inside, but not by changes to the magic node itself', () => {
      build([magic('m', [action('x'), action('y')]), action('o')], makeHost());
      scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'm', data: { spell: 'renamed' } });
      scheme.commands.dispatchCommand(CMD_SET_META, { id: 'm', meta: { note: 'n' } });
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();

      scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
        oldParentId: 'b',
        indexStart: 1,
        length: 1,
        newParentId: 'm',
        insertIndex: 2,
      });
      expect(scheme.nodes.getNode('m').meta.handEdited).toBe(true);
      expect(scheme.nodes.getNode('m').meta.note).toBe('n');
      expect(scheme.nodes.getNode('m').children.map((c) => c.id)).toEqual(['x', 'y', 'o']);

      scheme.commands.dispatchCommand(CMD_SET_META, { id: 'm', meta: { note: 'n' } });
      scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: 'y' });
      expect(scheme.nodes.getNode('m').children.map((c) => c.id)).toEqual(['x', 'o']);
    });

    it('is not set while the host is filling the node', () => {
      build([magic('m', [action('x')])], makeHost({ isFilling: (id) => id === 'm' }));
      scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'x', data: 'by agent' });
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();
      expect(scheme.nodes.getNode('x').data).toBe('by agent');
    });

    it('does nothing for an edit outside any magic node', () => {
      build([magic('m', [action('x')]), action('o')], makeHost());
      scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'o', data: 'v' });
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();
    });
  });

  describe('unwrap', () => {
    it('moves the steps into the parent and deletes the container as one undo step', () => {
      build([action('a1'), magic('m', [action('x1'), action('x2')]), action('a2')]);
      const buttons: { text: string; onClick: () => void }[] = [];
      const menu = resolveService(TOKEN_CONTEXT_MENU, scheme.container).buildForIcon({
        scheme,
        icon: scheme.icons.getIcon('m'),
      });
      const flat = JSON.stringify(menu);
      expect(flat).toContain('magic:menu.unwrap');
      const walk = (items: unknown[]) =>
        items.forEach((item) => {
          const i = item as { type: string; text?: string; onClick?: () => void; children?: unknown[] };
          if (i.type === 'button' && i.text && i.onClick) buttons.push({ text: i.text, onClick: i.onClick });
          if (i.children) walk(i.children);
        });
      walk(menu as unknown[]);
      buttons.find((b) => b.text === 'magic:menu.unwrap')?.onClick();
      expect(bodyIds()).toEqual(['action:a1', 'action:x1', 'action:x2', 'action:a2']);
      expect(scheme.icons.getIconSafe('x1')).not.toBeNull();
      expect(scheme.icons.getIconSafe('m')).toBeNull();
      history().back();
      expect(bodyIds()).toEqual(['action:a1', 'magic:m', 'action:a2']);
      expect(scheme.nodes.getNode('m').children.map((c) => c.id)).toEqual(['x1', 'x2']);
      history().forward();
      expect(bodyIds()).toEqual(['action:a1', 'action:x1', 'action:x2', 'action:a2']);
    });
  });
  describe('nodes nested deep inside a magic node (no icons exist for them)', () => {
    const deep = () =>
      magic('m', [
        {
          id: 'i',
          name: 'if',
          data: 'x',
          children: [
            { id: 'c1', name: 'if-child', children: [action('a1')] },
            { id: 'c2', name: 'if-child', children: [action('a2')] },
          ],
        },
      ]);
    const ids = (id: string) => scheme.nodes.getNode(id).children.map((c) => c.id);

    beforeEach(() => {
      build([deep()], makeHost());
    });

    it('builds no icon below the magic block', () => {
      ['i', 'c1', 'c2', 'a1', 'a2'].forEach((id) => expect(scheme.icons.getIconSafe(id)).toBeNull());
    });

    it('survives insert, delete, move, set-out, setData and setMeta deep inside; handEdited set once; undo/redo round-trip', () => {
      const h = history();
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: 'c1', index: 1, node: action('n1') });
      expect(ids('c1')).toEqual(['a1', 'n1']);
      expect(scheme.nodes.getNode('m').meta.handEdited).toBe(true);
      h.back();
      expect(ids('c1')).toEqual(['a1']);
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();
      h.forward();
      expect(ids('c1')).toEqual(['a1', 'n1']);

      scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: 'n1' });
      expect(ids('c1')).toEqual(['a1']);

      scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
        oldParentId: 'c1',
        indexStart: 0,
        length: 1,
        newParentId: 'c2',
        insertIndex: 1,
      });
      expect(ids('c1')).toEqual([]);
      expect(ids('c2')).toEqual(['a2', 'a1']);

      scheme.commands.dispatchCommand(CMD_SET_OUT, { id: 'c2', outNode: { id: 'o', name: 'out' } });
      expect(scheme.nodes.getNode('c2').out?.id).toBe('o');
      scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'a2', data: 'v' });
      scheme.commands.dispatchCommand(CMD_SET_META, { id: 'a2', meta: { k: 1 } });
      expect(scheme.nodes.getNode('a2').data).toBe('v');

      // set-out has no history handler (pre-existing), so five undoable steps remain
      for (let n = 0; n < 5; n += 1) h.back();
      expect(ids('c1')).toEqual(['a1']);
      expect(ids('c2')).toEqual(['a2']);
      expect(scheme.nodes.getNode('m').meta.handEdited).toBeUndefined();
      for (let n = 0; n < 5; n += 1) h.forward();
      expect(ids('c2')).toEqual(['a2', 'a1']);
      expect(scheme.nodes.getNode('c2').out?.id).toBe('o');
      ['i', 'c1', 'c2', 'a1', 'a2', 'o'].forEach((id) => expect(scheme.icons.getIconSafe(id)).toBeNull());
    });

    it('moving a visible node into the magic node leaves no stray icons; moving it out recreates them', () => {
      build(
        [
          deep(),
          {
            id: 'v',
            name: 'if',
            data: 'y',
            children: [
              { id: 'vc', name: 'if-child', children: [action('va')] },
              { id: 'vd', name: 'if-child', children: [] },
            ],
          },
        ],
        makeHost(),
      );
      expect(scheme.icons.getIconSafe('va')).not.toBeNull();
      scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
        oldParentId: 'b',
        indexStart: 1,
        length: 1,
        newParentId: 'c1',
        insertIndex: 0,
      });
      ['v', 'vc', 'va'].forEach((id) => expect(scheme.icons.getIconSafe(id)).toBeNull());
      scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
        oldParentId: 'c1',
        indexStart: 0,
        length: 1,
        newParentId: 'b',
        insertIndex: 1,
      });
      expect(scheme.icons.getIconSafe('va')).not.toBeNull();
    });
  });
});
