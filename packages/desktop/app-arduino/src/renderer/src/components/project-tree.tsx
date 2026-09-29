import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { isValidFunctionName } from '@falang/dto';
import { ConfigProvider, Menu, Tree, message } from 'antd';
import type { MenuProps, TreeDataNode } from 'antd';
import { useArduinoProjectStore } from '../arduino-project-store-context.js';
import type { ArduinoProjectStore, DesktopDocument } from '../arduino-project-store.js';
import { isArduinoPinnedDocument, REQUIRED_ROOT_DOCUMENT_NAMES } from '../pinned-documents.js';
import { S } from './project-tree.styles.js';
import { reportError } from '../../../shared/report-error.js';
import { DEVICES_DOCUMENT_TYPE } from '../../../shared/devices-document.js';

const FUNCTION_ICON = 'ƒ';
const DEVICES_ICON = '🔌';

interface ContextMenuState {
  x: number;
  y: number;
  nodeKey: string;
}

interface NewItem {
  type: 'function' | 'folder';
  parentId: string | null;
  name: string;
}

const idOf = (k: string) => k.slice(k.indexOf(':') + 1);

/** Root-level pinned documents (ADR 0032 (private), "Decision → 2") sort first, in this order — `Devices`, then `setup`, then `loop`; everything else keeps today's plain insertion order. */
const rootPinnedPriority = (doc: DesktopDocument): number => {
  if (doc.type === DEVICES_DOCUMENT_TYPE) return 0;
  if (doc.name === REQUIRED_ROOT_DOCUMENT_NAMES[0]) return 1;
  if (doc.name === REQUIRED_ROOT_DOCUMENT_NAMES[1]) return 2;
  return 3;
};

const sortRootDocuments = (docs: readonly DesktopDocument[]): DesktopDocument[] => {
  const pinned = docs
    .filter((doc) => isArduinoPinnedDocument(doc))
    .toSorted((a, b) => rootPinnedPriority(a) - rootPinnedPriority(b));
  const rest = docs.filter((doc) => !isArduinoPinnedDocument(doc));
  return [...pinned, ...rest];
};

const buildTreeData = (
  store: ArduinoProjectStore,
  parentId: string | null,
  expandedKeys: Set<React.Key>,
): TreeDataNode[] => {
  const nodes: TreeDataNode[] = [];
  for (const folder of store.folders) {
    if (folder.parentId !== parentId) continue;
    const key: React.Key = `folder:${folder.id}`;
    nodes.push({
      key,
      title: folder.name,
      icon: expandedKeys.has(key) ? '📂' : '📁',
      isLeaf: false,
      children: buildTreeData(store, folder.id, expandedKeys),
    });
  }
  const documentsHere = store.documents.filter((doc) => doc.folderId === parentId);
  const ordered = parentId === null ? sortRootDocuments(documentsHere) : documentsHere;
  for (const doc of ordered) {
    nodes.push({
      key: `doc:${doc.id}`,
      title: doc.name,
      icon: doc.type === DEVICES_DOCUMENT_TYPE ? DEVICES_ICON : FUNCTION_ICON,
      isLeaf: true,
    });
  }
  return nodes;
};

const getFolderLabel = (store: ArduinoProjectStore, id: string | null): string => {
  if (!id) return 'root';
  return store.folders.find((f) => f.id === id)?.name ?? 'folder';
};

const getMenuItems = (store: ArduinoProjectStore, nodeKey: string): MenuProps['items'] => {
  if (nodeKey.startsWith('folder:')) {
    return [
      { key: 'new-subfolder', label: 'New subfolder' },
      { key: 'new-function', label: 'New function here' },
      { type: 'divider' as const },
      { key: 'delete', label: 'Delete folder', danger: true },
    ];
  }
  // Pinned documents (`setup`/`loop`/`Devices`) show no context menu at all — mirrors
  // `packages/workflow/client-common/src/components/project-tree.tsx`'s `doc?.pinned` check.
  if (store.isPinned(idOf(nodeKey))) return [];
  return [{ key: 'delete', label: 'Delete', danger: true }];
};

export const ProjectTree: React.FC = observer(() => {
  const store = useArduinoProjectStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const prevFolderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const existing = prevFolderIdsRef.current;
    const newKeys = store.folders.filter((f) => !existing.has(f.id)).map((f): React.Key => `folder:${f.id}`);
    if (newKeys.length > 0) setExpandedKeys((keys) => [...keys, ...newKeys]);
    prevFolderIdsRef.current = new Set(store.folders.map((f) => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.folders.length]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const treeData = buildTreeData(store, null, new Set(expandedKeys));
  const selectedKeys = store.activeTabId ? [`doc:${store.activeTabId}`] : [];

  const handleSelect = useCallback(
    (_keys: React.Key[], info: { node: { key: React.Key } }) => {
      const key = String(info.node.key);
      if (key.startsWith('doc:')) store.openTab(idOf(key));
      else if (key.startsWith('folder:'))
        setExpandedKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));
    },
    [store],
  );

  const handleExpand = useCallback((keys: React.Key[]) => setExpandedKeys(keys), []);

  const handleDrop = useCallback(
    (info: { dragNode: { key: React.Key }; node: { key: React.Key }; dropToGap: boolean }) => {
      const dragKey = String(info.dragNode.key);
      const dropKey = String(info.node.key);
      let targetParentId: string | null = null;
      if (info.dropToGap) {
        targetParentId = dropKey.startsWith('folder:')
          ? (store.folders.find((f) => f.id === idOf(dropKey))?.parentId ?? null)
          : (store.documents.find((d) => d.id === idOf(dropKey))?.folderId ?? null);
      } else if (dropKey.startsWith('folder:')) {
        targetParentId = idOf(dropKey);
      } else {
        targetParentId = store.documents.find((d) => d.id === idOf(dropKey))?.folderId ?? null;
      }
      if (dragKey.startsWith('folder:')) {
        store.moveFolder(idOf(dragKey), targetParentId);
      } else {
        store.moveDocument(idOf(dragKey), targetParentId);
      }
    },
    [store],
  );

  const handleRightClick = useCallback(({ event, node }: { event: React.MouseEvent; node: { key: React.Key } }) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeKey: String(node.key) });
  }, []);

  const handleMenuClick = useCallback(
    ({ key }: { key: string }) => {
      if (!contextMenu) return;
      const { nodeKey } = contextMenu;
      setContextMenu(null);
      const parentId = nodeKey.startsWith('folder:') ? idOf(nodeKey) : null;
      if (key === 'delete') {
        if (nodeKey.startsWith('folder:')) store.deleteFolder(idOf(nodeKey));
        // Double-checked here (not just by hiding the menu item) so a stale/already-open context
        // menu can't fire a delete on a document that became pinned between right-click and click.
        else if (!store.isPinned(idOf(nodeKey))) store.deleteDocument(idOf(nodeKey));
      } else if (key === 'new-subfolder') {
        setNewItem({ type: 'folder', parentId: idOf(nodeKey), name: '' });
      } else if (key === 'new-function') {
        setNewItem({ type: 'function', parentId, name: '' });
      }
    },
    [contextMenu, store],
  );

  const handleAllowDrop = useCallback(
    (options: { dragNode: { key: React.Key }; dropNode: { key: React.Key }; dropPosition: number }) => {
      const dropKey = String(options.dropNode.key);
      const dragKey = String(options.dragNode.key);
      // Belt-and-suspenders alongside `draggable.nodeDraggable` below — a pinned document can never
      // be the drag source, however the drag itself got started.
      if (dragKey.startsWith('doc:') && store.isPinned(idOf(dragKey))) return false;
      if (options.dropPosition === 0 && dropKey.startsWith('doc:')) return false;
      if (options.dropPosition === 0 && dragKey.startsWith('folder:') && dropKey.startsWith('folder:')) {
        const dragId = idOf(dragKey);
        const dropId = idOf(dropKey);
        if (dragId === dropId || new Set(store.getFolderDescendantIds(dragId)).has(dropId)) return false;
      }
      return true;
    },
    [store],
  );

  /** antd `Tree`'s `draggable.nodeDraggable` — the primary defense keeping a pinned document from ever starting a drag (see `handleAllowDrop` above for the drop-side backstop). */
  const isNodeDraggable = useCallback(
    (node: { key: React.Key }): boolean => {
      const key = String(node.key);
      return !(key.startsWith('doc:') && store.isPinned(idOf(key)));
    },
    [store],
  );

  const handleCreateItem = () => {
    if (!newItem) return;
    const name = newItem.name.trim();
    if (name) {
      if (newItem.type === 'folder') {
        store
          .createFolder(name, newItem.parentId)
          .catch((error: unknown) => reportError('Failed to create folder', error));
      } else if (!isValidFunctionName(name)) {
        message.warning(
          'Function name must be English, camelCase (e.g. myFunctionName) — no spaces, punctuation, or a leading digit',
        );
      } else if (newItem.parentId === null && (REQUIRED_ROOT_DOCUMENT_NAMES as readonly string[]).includes(name)) {
        // `setup`/`loop` are scaffolded once and pinned for the life of the project (see
        // `pinned-documents.ts`) — a second root-level document with the same name would just shadow
        // the real one in the tree while `compileArduinoProject` keeps using whichever it finds first.
        message.warning(`"${name}" is a reserved document name at the project root`);
      } else {
        store.createDocument(name, newItem.parentId);
      }
    }
    setNewItem(null);
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateItem();
    if (e.key === 'Escape') setNewItem(null);
  };

  return (
    <div style={S.root}>
      <style>{'.ant-tree-switcher{display:none!important}'}</style>
      <div style={S.header}>Project</div>

      {newItem && (
        <div style={S.newRow}>
          <span>{newItem.type === 'folder' ? '📁' : FUNCTION_ICON}</span>
          <input
            autoFocus
            style={S.newInput}
            value={newItem.name}
            placeholder={newItem.type === 'folder' ? 'Folder name...' : 'Function name...'}
            onChange={(e) => setNewItem((item) => (item ? { ...item, name: e.target.value } : null))}
            onKeyDown={handleNewItemKeyDown}
            onBlur={handleCreateItem}
          />
          <span style={S.hint}>in {getFolderLabel(store, newItem.parentId)}</span>
        </div>
      )}

      <div style={S.list}>
        <ConfigProvider theme={{ token: { colorBgContainer: 'transparent', fontSize: 13 } }}>
          <Tree
            treeData={treeData}
            showIcon
            switcherIcon={() => null}
            draggable={{ icon: false, nodeDraggable: isNodeDraggable }}
            blockNode
            selectedKeys={selectedKeys}
            expandedKeys={expandedKeys}
            onSelect={handleSelect}
            onExpand={handleExpand}
            onDrop={handleDrop}
            onRightClick={handleRightClick}
            allowDrop={handleAllowDrop}
            style={{ background: 'transparent' }}
          />
        </ConfigProvider>
        {treeData.length === 0 && !newItem && <div style={S.empty}>No documents yet</div>}
      </div>

      <div style={S.actions}>
        <button style={S.btn} onClick={() => setNewItem({ type: 'function', parentId: null, name: '' })}>
          + Function
        </button>
        <button style={S.btn} onClick={() => setNewItem({ type: 'folder', parentId: null, name: '' })}>
          + Folder
        </button>
      </div>

      {contextMenu && (
        <div style={{ ...S.ctxWrap, top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <Menu items={getMenuItems(store, contextMenu.nodeKey)} onClick={handleMenuClick} style={S.ctxMenu} />
        </div>
      )}
    </div>
  );
});
