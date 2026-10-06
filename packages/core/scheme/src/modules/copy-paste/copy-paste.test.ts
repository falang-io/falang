// oxlint-disable max-lines
import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import { resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import type { Scheme } from '../../scheme/scheme.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { insertNode } from '../../actions/insert-node.js';
import { getDto } from '../../utils/get-dto.js';
import type { IModule } from '../../utils/i-module.js';
import type { IContextMenuButton, IContextMenuItem } from '../../types/context-menu.js';
import { ContextMenuModule } from '../context-menu/context-menu.module.js';
import { TOKEN_CONTEXT_MENU } from '../context-menu/context-menu.service.token.js';
import { HistoryModule } from '../history/history.module.js';
import { TOKEN_HISTORY } from '../history/history.store.token.js';
import { IconsTransferModule } from '../icons-transfer/icons-transfer.module.js';
import { TOKEN_ICONS_TRANSFER_SERVICE } from '../icons-transfer/icons-transfer.service.token.js';
import { ValencePointsModule } from '../valence-points/valence-points.module.js';
import { TOKEN_VALENCE_POINTS } from '../valence-points/valence-points.service.token.js';
import { cloneWithNewIds } from './copy-paste.utils.js';
import { CopyPasteModule, MENU_COPY, MENU_PASTE, TOKEN_COPY_PASTE } from './copy-paste.module.js';
import type { CopyPasteService } from './copy-paste.service.js';
import { MemorySchemeClipboard, type ICopyPasteModuleParams, type ISchemeClipboard } from './copy-paste.types.js';

const collectIds = (node: INode): string[] => [
  node.id,
  ...(node.children ?? []).flatMap((child) => collectIds(child)),
  ...(node.mods ?? []).flatMap((mod) => collectIds(mod)),
  ...(node.out ? collectIds(node.out) : []),
];

/** The node tree with every id blanked — two trees are "the same icons" when these are equal. */
const withoutIds = (node: INode): INode => ({
  ...node,
  id: '',
  ...(node.children ? { children: node.children.map((child) => withoutIds(child)) } : {}),
  ...(node.mods ? { mods: node.mods.map((mod) => withoutIds(mod)) } : {}),
  ...(node.out ? { out: withoutIds(node.out) } : {}),
});

const findButton = (menu: IContextMenuItem[], text: string): IContextMenuButton | undefined =>
  menu.find((item): item is IContextMenuButton => item.type === 'button' && item.text === text);

const bodyIdOf = (scheme: Scheme) => {
  const id = scheme.rootNode?.children[1].id;
  if (!id) throw new Error('Root not set');
  return id;
};
const childIds = (scheme: Scheme, parentId: string) => scheme.nodes.getNode(parentId).children.map((c) => c.id);

describe('cloneWithNewIds', () => {
  it('replaces the id of the node and of every child, mod and out, deep-copying data and meta', () => {
    const source: INode = {
      id: 'a',
      name: 'cycle',
      data: { nested: { value: 1 } },
      meta: { width: 100 },
      mods: [{ id: 'm', name: 'mod1', data: 3 }],
      children: [
        { id: 'b', name: 'action', data: 'x' },
        { id: 'c', name: 'switch-option', data: 0, children: [], out: { id: 'o', name: 'out' } },
      ],
    };
    const before = structuredClone(source);
    const clone = cloneWithNewIds(source);

    const oldIds = collectIds(source);
    const newIds = collectIds(clone);
    assert.lengthOf(newIds, oldIds.length);
    assert.lengthOf(new Set(newIds), newIds.length);
    for (const id of newIds) assert.notInclude(oldIds, id);
    assert.deepEqual(withoutIds(clone), withoutIds(source));

    (clone.data as { nested: { value: number } }).nested.value = 2;
    (clone.meta as { width: number }).width = 1;
    assert.deepEqual(source, before);
  });

  it('uses the given id generator', () => {
    let n = 0;
    const clone = cloneWithNewIds({ id: 'a', name: 'cycle', children: [{ id: 'b', name: 'action' }] }, () => {
      n += 1;
      return `n${n}`;
    });
    assert.deepEqual(collectIds(clone), ['n1', 'n2']);
  });
});

describe('CopyPaste module test', () => {
  // oxlint-disable-next-line init-declarations
  let clipboard: ISchemeClipboard;
  const schemes: Scheme[] = [];

  const createScheme = (params: Partial<ICopyPasteModuleParams> = {}, extra: IModule[] = [], readOnly = false) => {
    const scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [
        new ValencePointsModule(),
        new ContextMenuModule(),
        new IconsTransferModule(),
        new HistoryModule(),
        new CopyPasteModule({ projectType: 'logic', documentType: 'function', clipboard, ...params }),
        ...extra,
      ],
      document: getTestEmptyDoc(),
      readOnly,
    });
    schemes.push(scheme);
    return scheme;
  };
  const service = (scheme: Scheme): CopyPasteService => resolveService(TOKEN_COPY_PASTE, scheme.container);
  const insert = (scheme: Scheme, parentId: string, index: number, node: INode) => {
    insertNode({ parentId, index, node }, scheme);
    return node;
  };

  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  let bodyId = '';
  /* oxlint-disable init-declarations */
  let a1: INode, a2: INode, loop: INode, sw: INode;
  /* oxlint-enable init-declarations */

  beforeEach(() => {
    clipboard = new MemorySchemeClipboard();
    scheme = createScheme();
    bodyId = bodyIdOf(scheme);
    const factory = (name: string) => scheme.infra.structure.factory(name);
    a1 = insert(scheme, bodyId, 0, { ...factory('action'), data: 'first' });
    a2 = insert(scheme, bodyId, 1, { ...factory('action'), data: 'second', mods: [{ ...factory('mod1'), data: 7 }] });
    loop = insert(scheme, bodyId, 2, { ...factory('while'), data: 'i < 5', mods: [{ ...factory('mod1'), data: 1 }] });
    insert(scheme, loop.id, 0, { ...factory('action'), data: 'inside' });
    sw = insert(scheme, bodyId, 3, factory('switch'));
  });

  afterEach(() => {
    schemes.splice(0).forEach((s) => s.dispose());
  });

  describe('copy', () => {
    it('stores the whole subtree together with the project type and document type', () => {
      const payload = service(scheme).copy([loop.id]);
      assert.isNotNull(payload);
      assert.equal(payload?.projectType, 'logic');
      assert.equal(payload?.documentType, 'function');
      assert.deepEqual(payload?.nodes, [getDto(loop.id, scheme)]);
      assert.strictEqual(clipboard.read(), payload);
    });

    it('copies the icons-transfer selection when the icon belongs to it, else only the icon', () => {
      const transfer = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      transfer.iconClicked(scheme.icons.getIcon(a1.id), scheme);
      transfer.iconClicked(scheme.icons.getIcon(a2.id), scheme, true);
      assert.deepEqual(service(scheme).getCopyIds(a2.id), [a1.id, a2.id]);
      assert.deepEqual(service(scheme).getCopyIds(loop.id), [loop.id]);
    });

    it('refuses the root, fixed tuple slots and mods', () => {
      const copyPaste = service(scheme);
      const root = scheme.rootNode;
      if (!root) throw new Error('Root not set');
      assert.isFalse(copyPaste.canCopy(root.id));
      // Function-header
      assert.isFalse(copyPaste.canCopy(root.children[0].id));
      // Function-body
      assert.isFalse(copyPaste.canCopy(bodyId));
      assert.isFalse(copyPaste.canCopy(a2.mods?.[0].id ?? ''));
      assert.isNull(copyPaste.copy([root.id]));
      assert.isNull(clipboard.read());

      const ifNode = insert(scheme, bodyId, 0, scheme.infra.structure.factory('if'));
      // An `if` branch
      assert.isFalse(copyPaste.canCopy(ifNode.children?.[0].id ?? ''));
      assert.isTrue(copyPaste.canCopy(ifNode.id));
    });
  });

  describe('paste', () => {
    it('inserts copies with every id (children, mods, out) replaced', () => {
      const copyPaste = service(scheme);
      copyPaste.copy([a2.id, loop.id]);
      const before = new Set(collectIds(getDto(scheme.rootNode?.id ?? '', scheme)));

      const pasted = copyPaste.paste(bodyId, 4);
      assert.lengthOf(pasted, 2);
      assert.deepEqual(childIds(scheme, bodyId).slice(4), pasted);

      const originals = [getDto(a2.id, scheme), getDto(loop.id, scheme)];
      const copies = pasted.map((id) => getDto(id, scheme));
      assert.deepEqual(
        copies.map((node) => withoutIds(node)),
        originals.map((node) => withoutIds(node)),
      );
      const newIds = copies.flatMap((node) => collectIds(node));
      assert.lengthOf(newIds, originals.flatMap((node) => collectIds(node)).length);
      for (const id of newIds) assert.isFalse(before.has(id), `id ${id} was reused`);
      assert.lengthOf(new Set(newIds), newIds.length);
      // The originals are untouched.
      assert.deepEqual(childIds(scheme, bodyId).slice(0, 4), [a1.id, a2.id, loop.id, sw.id]);
    });

    it('gives every paste of the same clipboard its own ids', () => {
      const copyPaste = service(scheme);
      copyPaste.copy([loop.id]);
      const [first] = copyPaste.paste(bodyId, 0);
      const [second] = copyPaste.paste(bodyId, 0);
      const firstIds = collectIds(getDto(first, scheme));
      const secondIds = collectIds(getDto(second, scheme));
      for (const id of secondIds) assert.notInclude(firstIds, id);
      assert.deepEqual(withoutIds(getDto(first, scheme)), withoutIds(getDto(second, scheme)));
    });

    it('pastes into a nested list and into another scheme of the same project and document type', () => {
      service(scheme).copy([a1.id]);
      const [nested] = service(scheme).paste(loop.id, 1);
      assert.deepEqual(childIds(scheme, loop.id)[1], nested);

      const other = createScheme();
      const otherBody = bodyIdOf(other);
      const [pasted] = service(other).paste(otherBody, 0);
      assert.deepEqual(childIds(other, otherBody), [pasted]);
      assert.notEqual(pasted, a1.id);
      assert.deepEqual(withoutIds(getDto(pasted, other)), withoutIds(getDto(a1.id, scheme)));
    });

    it('refuses a clipboard from another project type or document type unless canPasteFrom allows it', () => {
      service(scheme).copy([a1.id]);
      const otherDocument = createScheme({ documentType: 'objects-structure' });
      const otherProject = createScheme({ projectType: 'workflow' });
      assert.isFalse(service(otherDocument).canPasteAt(bodyIdOf(otherDocument), 0));
      assert.deepEqual(service(otherDocument).paste(bodyIdOf(otherDocument), 0), []);
      assert.deepEqual(childIds(otherDocument, bodyIdOf(otherDocument)), []);
      assert.isFalse(service(otherProject).canPasteAt(bodyIdOf(otherProject), 0));

      const lenient = createScheme({
        documentType: 'trigger-function',
        canPasteFrom: (source, target) => source.projectType === target.projectType,
      });
      assert.lengthOf(service(lenient).paste(bodyIdOf(lenient), 0), 1);
    });

    it('follows the parent children policy', () => {
      const copyPaste = service(scheme);
      const [option] = sw.children ?? [];
      copyPaste.copy([option.id]);
      // A switch-option is no statement
      assert.isFalse(copyPaste.canPasteAt(bodyId, 0));
      assert.isTrue(copyPaste.canPasteAt(sw.id, 2));
      const [pasted] = copyPaste.paste(sw.id, 2);
      assert.equal(scheme.nodes.getNode(pasted).name, 'switch-option');

      copyPaste.copy([a1.id]);
      // An action is no switch option
      assert.isFalse(copyPaste.canPasteAt(sw.id, 0));
      assert.isTrue(copyPaste.canPasteAt(option.id, 0));
      assert.isFalse(copyPaste.canPasteAt(bodyId, 99));
    });

    it('never puts a node with an out first in a list', () => {
      const factory = (name: string) => scheme.infra.structure.factory(name);
      const option = insert(scheme, sw.id, 2, { ...factory('switch-option'), out: factory('out') });
      const copyPaste = service(scheme);
      copyPaste.copy([option.id]);
      assert.isFalse(copyPaste.canPasteAt(sw.id, 0));
      assert.isTrue(copyPaste.canPasteAt(sw.id, 1));
      const [pasted] = copyPaste.paste(sw.id, 1);
      assert.equal(scheme.nodes.getNode(pasted).out?.name, 'out');
      assert.notEqual(scheme.nodes.getNode(pasted).out?.id, scheme.nodes.getNode(option.id).out?.id);
    });

    it('refuses node kinds the target scheme does not know', () => {
      clipboard.write({
        format: 'falang/scheme-nodes',
        version: 1,
        projectType: 'logic',
        documentType: 'function',
        nodes: [{ id: 'x', name: 'cycle', children: [{ id: 'y', name: 'unknown-kind' }] }],
      });
      assert.isFalse(service(scheme).canPasteAt(bodyId, 0));
    });

    it('does nothing in a read-only scheme', () => {
      service(scheme).copy([a1.id]);
      const readOnly = createScheme({}, [], true);
      assert.isFalse(service(readOnly).canPasteAt(bodyIdOf(readOnly), 0));
      assert.deepEqual(service(readOnly).paste(bodyIdOf(readOnly), 0), []);
    });

    it('is one undo step', () => {
      const copyPaste = service(scheme);
      copyPaste.copy([a1.id, a2.id]);
      const before = childIds(scheme, bodyId);
      copyPaste.paste(bodyId, 0);
      assert.lengthOf(childIds(scheme, bodyId), before.length + 2);
      resolveService(TOKEN_HISTORY, scheme.container).back();
      assert.deepEqual(childIds(scheme, bodyId), before);
    });
  });

  describe('context menu', () => {
    const iconMenu = (id: string) =>
      resolveService(TOKEN_CONTEXT_MENU, scheme.container).buildForIcon({ icon: scheme.icons.getIcon(id), scheme });
    const vpMenu = (parentId: string, index: number) => {
      const vp = resolveService(TOKEN_VALENCE_POINTS, scheme.container).allValencePoints.find(
        (p) => p.parentId === parentId && p.index === index,
      );
      if (!vp) throw new Error(`No valence point ${parentId}#${index}`);
      return resolveService(TOKEN_CONTEXT_MENU, scheme.container).buildForValencePoint({
        vp,
        parent: scheme.icons.getIcon(parentId),
        scheme,
      });
    };

    it('offers Copy on copyable icons and Paste on valence points once something compatible was copied', () => {
      const root = scheme.rootNode;
      if (!root) throw new Error('Root not set');
      assert.isUndefined(findButton(iconMenu(root.id), MENU_COPY));
      assert.isUndefined(findButton(vpMenu(bodyId, 0), MENU_PASTE));

      const copyButton = findButton(iconMenu(loop.id), MENU_COPY);
      assert.isDefined(copyButton);
      copyButton?.onClick();
      assert.equal(clipboard.read()?.nodes[0].name, 'while');

      const pasteButton = findButton(vpMenu(bodyId, 0), MENU_PASTE);
      assert.isDefined(pasteButton);
      pasteButton?.onClick();
      const [first] = childIds(scheme, bodyId);
      assert.notEqual(first, loop.id);
      assert.equal(scheme.nodes.getNode(first).name, 'while');

      // A switch option on the clipboard can't go into a statement list.
      service(scheme).copy([sw.children?.[0].id ?? '']);
      assert.isUndefined(findButton(vpMenu(bodyId, 0), MENU_PASTE));
    });
  });
});
