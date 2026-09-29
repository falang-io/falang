// oxlint-disable max-lines -- crossed 300 lines with the new function-name-format guard in
// `handleCreateItem`; not accumulated complexity worth splitting the file over.
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { isValidFunctionName } from '@falang/dto';
import { ConfigProvider, Menu, message, Tree } from 'antd';
import type { MenuProps, TreeDataNode } from 'antd';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';
import { DOCUMENT_TYPES, type DesktopProjectStore, type DocumentType } from '../desktop-project-store.js';
import { S } from './project-tree.styles.js';
import { reportError } from '../../../shared/report-error.js';

const DOC_ICONS: Record<DocumentType, string> = {
  contour: '⚙',
  'text-function': 'ƒ',
  'mind-tree': '🌳',
  function: 'ƒ',
  'objects-structure': '▤',
  'enum-structure': '☰',
  'external-api-structure': '☁',
  'simple-code-cpp': 'C',
  'simple-code-js': 'J',
  'simple-code-ts': 'T',
  'simple-code-php': 'P',
  'simple-code-rust': '🦀',
};
const ITEM_ICONS: Record<DocumentType | 'folder', string> = { folder: '📁', ...DOC_ICONS };
const PLACEHOLDERS: Record<DocumentType | 'folder', string> = {
  folder: 'Folder name...',
  contour: 'Contour name...',
  'text-function': 'Function name...',
  'mind-tree': 'Tree name...',
  function: 'Logic function name...',
  'objects-structure': 'Structure name...',
  'enum-structure': 'Enum name...',
  'external-api-structure': 'External API name...',
  'simple-code-cpp': 'C++ file name...',
  'simple-code-js': 'JavaScript file name...',
  'simple-code-ts': 'TypeScript file name...',
  'simple-code-php': 'PHP file name...',
  'simple-code-rust': 'Rust file name...',
};
const DOC_TYPE_ORDER: DocumentType[] = [
  'text-function',
  'contour',
  'mind-tree',
  'function',
  'objects-structure',
  'enum-structure',
  'external-api-structure',
  'simple-code-cpp',
  'simple-code-js',
  'simple-code-ts',
  'simple-code-php',
  'simple-code-rust',
];

interface ContextMenuState {
  x: number;
  y: number;
  nodeKey: string;
}

interface NewItem {
  type: DocumentType | 'folder';
  parentId: string | null;
  name: string;
}

const idOf = (k: string) => k.slice(k.indexOf(':') + 1);

const buildTreeData = (
  store: DesktopProjectStore,
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
  for (const doc of store.documents) {
    if (doc.folderId !== parentId) continue;
    nodes.push({
      key: `doc:${doc.id}`,
      title: doc.name,
      icon: DOC_ICONS[doc.type],
      isLeaf: true,
    });
  }
  return nodes;
};

const getFolderLabel = (store: DesktopProjectStore, id: string | null): string => {
  if (!id) return 'root';
  return store.folders.find((f) => f.id === id)?.name ?? 'folder';
};

const getMenuItems = (nodeKey: string, allowedDocumentTypes: readonly DocumentType[]): MenuProps['items'] => {
  if (nodeKey.startsWith('folder:')) {
    return [
      { key: 'new-subfolder', label: 'New subfolder' },
      ...DOC_TYPE_ORDER.filter((type) => allowedDocumentTypes.includes(type)).map((type) => ({
        key: `new-${type}`,
        label: `New ${DOCUMENT_TYPES[type].label.toLowerCase()} here`,
      })),
      { type: 'divider' as const },
      { key: 'delete', label: 'Delete folder', danger: true },
    ];
  }
  return [{ key: 'delete', label: 'Delete', danger: true }];
};

export const ProjectTree: React.FC = observer(() => {
  const store = useDesktopProjectStore();
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
      const docType = DOC_TYPE_ORDER.find((type) => key === `new-${type}`);
      if (key === 'delete') {
        if (nodeKey.startsWith('folder:')) store.deleteFolder(idOf(nodeKey));
        else store.deleteDocument(idOf(nodeKey));
      } else if (key === 'new-subfolder') {
        setNewItem({ type: 'folder', parentId: idOf(nodeKey), name: '' });
      } else if (docType) {
        setNewItem({ type: docType, parentId, name: '' });
      }
    },
    [contextMenu, store],
  );

  const handleAllowDrop = useCallback(
    (options: { dragNode: { key: React.Key }; dropNode: { key: React.Key }; dropPosition: number }) => {
      const dropKey = String(options.dropNode.key);
      const dragKey = String(options.dragNode.key);
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

  const handleCreateItem = () => {
    if (!newItem) return;
    const name = newItem.name.trim();
    if (name) {
      if (newItem.type === 'function' && !isValidFunctionName(name)) {
        message.warning(
          'Function name must be English, camelCase (e.g. myFunctionName) — no spaces, punctuation, or a leading digit',
        );
        return;
      }
      if (newItem.type === 'folder')
        store
          .createFolder(name, newItem.parentId)
          .catch((error: unknown) => reportError('Failed to create folder', error));
      else store.createDocument(newItem.type, name, newItem.parentId);
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
          <span>{ITEM_ICONS[newItem.type]}</span>
          <input
            autoFocus
            style={S.newInput}
            value={newItem.name}
            placeholder={PLACEHOLDERS[newItem.type]}
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
            draggable={{ icon: false }}
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
        {DOC_TYPE_ORDER.filter((type) => store.allowedDocumentTypes.includes(type)).map((type) => (
          <button key={type} style={S.btn} onClick={() => setNewItem({ type, parentId: null, name: '' })}>
            + {DOCUMENT_TYPES[type].label}
          </button>
        ))}
        <button style={S.btn} onClick={() => setNewItem({ type: 'folder', parentId: null, name: '' })}>
          + Folder
        </button>
      </div>

      {contextMenu && (
        <div style={{ ...S.ctxWrap, top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <Menu
            items={getMenuItems(contextMenu.nodeKey, store.allowedDocumentTypes)}
            onClick={handleMenuClick}
            style={S.ctxMenu}
          />
        </div>
      )}
    </div>
  );
});
