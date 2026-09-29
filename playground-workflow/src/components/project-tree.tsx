import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ConfigProvider, Menu, Tree } from 'antd';
import type { MenuProps, TreeDataNode } from 'antd';
import { workflowStore, type DocumentType } from '../workflow-store.js';

const DOC_ICONS: Record<string, string> = { function: '⚙', 'object-definition': '📦' };
const ITEM_ICONS: Record<string, string> = { folder: '📁', function: '⚙', 'object-definition': '📦' };
const PLACEHOLDERS: Record<string, string> = {
  folder: 'Folder name...',
  function: 'Function name...',
  'object-definition': 'Object name...',
};

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
  folders: typeof workflowStore.folders,
  documents: typeof workflowStore.documents,
  parentId: string | null,
  expandedKeys: Set<React.Key>,
): TreeDataNode[] => {
  const nodes: TreeDataNode[] = [];
  for (const folder of folders) {
    if (folder.parentId !== parentId) continue;
    const key: React.Key = `folder:${folder.id}`;
    nodes.push({
      key,
      title: folder.name,
      icon: expandedKeys.has(key) ? '📂' : '📁',
      isLeaf: false,
      children: buildTreeData(folders, documents, folder.id, expandedKeys),
    });
  }
  for (const doc of documents) {
    if (doc.parentId !== parentId) continue;
    nodes.push({ key: `doc:${doc.id}`, title: doc.name, icon: DOC_ICONS[doc.type], isLeaf: true });
  }
  return nodes;
};

const getFolderLabel = (id: string | null): string => {
  if (!id) return 'root';
  return workflowStore.folders.find((f) => f.id === id)?.name ?? 'folder';
};

const getMenuItems = (nodeKey: string): MenuProps['items'] => {
  if (nodeKey.startsWith('folder:')) {
    return [
      { key: 'new-subfolder', label: 'New subfolder' },
      { key: 'new-function', label: 'New function here' },
      { key: 'new-object', label: 'New object here' },
      { type: 'divider' },
      { key: 'delete', label: 'Delete folder', danger: true },
    ];
  }
  return [{ key: 'delete', label: 'Delete', danger: true }];
};

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1e1e2e',
    color: '#cdd6f4',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    userSelect: 'none',
  },
  header: {
    padding: '10px 12px 8px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6c7086',
    borderBottom: '1px solid #313244',
  },
  list: { flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 },
  empty: { padding: '12px', color: '#6c7086', fontSize: 12, textAlign: 'center' },
  newRow: { padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #313244' },
  newInput: {
    flex: 1,
    background: '#313244',
    border: '1px solid #cba6f7',
    borderRadius: 3,
    color: '#cdd6f4',
    padding: '2px 6px',
    fontSize: 13,
    outline: 'none',
  },
  hint: { fontSize: 10, color: '#6c7086', whiteSpace: 'nowrap' },
  actions: { display: 'flex', gap: 4, padding: '8px', borderTop: '1px solid #313244' },
  btn: {
    flex: 1,
    padding: '5px 4px',
    background: '#313244',
    border: 'none',
    borderRadius: 4,
    color: '#cdd6f4',
    fontSize: 11,
    cursor: 'pointer',
  },
  ctxWrap: { position: 'fixed', zIndex: 9999 },
  ctxMenu: { minWidth: 170, boxShadow: '0 4px 16px rgba(0,0,0,0.6)', borderRadius: 6 },
};

export const ProjectTree: React.FC = observer(() => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const prevFolderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const existing = prevFolderIdsRef.current;
    const newKeys = workflowStore.folders.filter((f) => !existing.has(f.id)).map((f): React.Key => `folder:${f.id}`);
    if (newKeys.length > 0) setExpandedKeys((keys) => [...keys, ...newKeys]);
    prevFolderIdsRef.current = new Set(workflowStore.folders.map((f) => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowStore.folders.length]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const treeData = buildTreeData(workflowStore.folders, workflowStore.documents, null, new Set(expandedKeys));
  const selectedKeys = workflowStore.activeTabId ? [`doc:${workflowStore.activeTabId}`] : [];

  const handleSelect = useCallback((_keys: React.Key[], info: { node: { key: React.Key } }) => {
    const key = String(info.node.key);
    if (key.startsWith('doc:')) workflowStore.openTab(idOf(key));
    else if (key.startsWith('folder:'))
      setExpandedKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));
  }, []);

  const handleExpand = useCallback((keys: React.Key[]) => setExpandedKeys(keys), []);

  const handleDrop = useCallback(
    (info: { dragNode: { key: React.Key }; node: { key: React.Key }; dropToGap: boolean }) => {
      const dragKey = String(info.dragNode.key);
      const dropKey = String(info.node.key);
      let targetParentId: string | null = null;
      if (info.dropToGap) {
        targetParentId = dropKey.startsWith('folder:')
          ? (workflowStore.folders.find((f) => f.id === idOf(dropKey))?.parentId ?? null)
          : (workflowStore.documents.find((d) => d.id === idOf(dropKey))?.parentId ?? null);
      } else if (dropKey.startsWith('folder:')) {
        targetParentId = idOf(dropKey);
      } else {
        targetParentId = workflowStore.documents.find((d) => d.id === idOf(dropKey))?.parentId ?? null;
      }
      if (dragKey.startsWith('folder:')) {
        workflowStore.moveFolder(idOf(dragKey), targetParentId);
      } else {
        workflowStore.moveDocument(idOf(dragKey), targetParentId);
      }
    },
    [],
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
        if (nodeKey.startsWith('folder:')) workflowStore.deleteFolder(idOf(nodeKey));
        else workflowStore.deleteDocument(idOf(nodeKey));
      } else if (key === 'new-subfolder') {
        setNewItem({ type: 'folder', parentId: idOf(nodeKey), name: '' });
      } else if (key === 'new-function') {
        setNewItem({ type: 'function', parentId, name: '' });
      } else if (key === 'new-object') {
        setNewItem({ type: 'objects-structure', parentId, name: '' });
      }
    },
    [contextMenu],
  );

  const handleAllowDrop = useCallback(
    (options: { dragNode: { key: React.Key }; dropNode: { key: React.Key }; dropPosition: number }) => {
      const dropKey = String(options.dropNode.key);
      const dragKey = String(options.dragNode.key);
      if (options.dropPosition === 0 && dropKey.startsWith('doc:')) return false;
      if (options.dropPosition === 0 && dragKey.startsWith('folder:') && dropKey.startsWith('folder:')) {
        const dragId = idOf(dragKey);
        const dropId = idOf(dropKey);
        if (dragId === dropId || new Set(workflowStore.getFolderDescendantIds(dragId)).has(dropId)) return false;
      }
      return true;
    },
    [],
  );

  const handleCreateItem = () => {
    if (!newItem) return;
    const name = newItem.name.trim();
    if (name) {
      if (newItem.type === 'folder') workflowStore.createFolder(name, newItem.parentId);
      else workflowStore.createDocument(newItem.type, name, newItem.parentId);
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
          <span style={S.hint}>in {getFolderLabel(newItem.parentId)}</span>
        </div>
      )}

      <div style={S.list}>
        <ConfigProvider theme={{ token: { colorBgContainer: 'transparent', colorText: '#cdd6f4', fontSize: 13 } }}>
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
            style={{ background: 'transparent', color: '#cdd6f4' }}
          />
        </ConfigProvider>
        {treeData.length === 0 && !newItem && <div style={S.empty}>No documents yet</div>}
      </div>

      <div style={S.actions}>
        <button style={S.btn} onClick={() => setNewItem({ type: 'function', parentId: null, name: '' })}>
          + Function
        </button>
        <button style={S.btn} onClick={() => setNewItem({ type: 'objects-structure', parentId: null, name: '' })}>
          + Object
        </button>
        <button style={S.btn} onClick={() => setNewItem({ type: 'folder', parentId: null, name: '' })}>
          + Folder
        </button>
      </div>

      {contextMenu && (
        <div style={{ ...S.ctxWrap, top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <Menu items={getMenuItems(contextMenu.nodeKey)} onClick={handleMenuClick} style={S.ctxMenu} />
        </div>
      )}
    </div>
  );
});
