import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { isValidFunctionName } from '@falang/dto';
import { ConfigProvider, Dropdown, Menu, message, Tree } from 'antd';
import type { MenuProps, TreeDataNode } from 'antd';
import { useWorkflowStore } from '../workflow-store-context.js';
import type { WorkflowStore } from '../workflow-store.js';
import type { DocumentType } from '../workflow-types.js';
import { S } from './project-tree.styles.js';
import { NewTriggerModal, type INewTriggerData } from './new-trigger-modal.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';

const DOC_ICONS: Record<string, string> = {
  function: '⚙',
  'objects-structure': '📦',
  integrations: '🔌',
  'trigger-function': '⚡',
};

const getAddMenuItems = (t: TFunction): MenuProps['items'] => [
  { key: 'function', label: t('client:project-tree.add-function') },
  { key: 'trigger', label: t('client:project-tree.add-trigger') },
  { key: 'folder', label: t('client:project-tree.add-folder') },
  { key: 'objects-structure', label: t('client:project-tree.add-object') },
];
const ITEM_ICONS: Record<string, string> = { folder: '📁', function: '⚙', 'objects-structure': '📦' };
const getPlaceholders = (t: TFunction): Record<string, string> => ({
  folder: t('client:project-tree.folder-placeholder'),
  function: t('client:project-tree.function-placeholder'),
  'objects-structure': t('client:project-tree.object-placeholder'),
});

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

const buildTreeData = (store: WorkflowStore, parentId: string | null, expandedKeys: Set<React.Key>): TreeDataNode[] => {
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

const getFolderLabel = (store: WorkflowStore, id: string | null, t: TFunction): string => {
  if (!id) return t('client:project-tree.root');
  return store.folders.find((f) => f.id === id)?.name ?? t('client:project-tree.folder-fallback');
};

const getMenuItems = (store: WorkflowStore, nodeKey: string, t: TFunction): MenuProps['items'] => {
  if (nodeKey.startsWith('folder:')) {
    return [
      { key: 'new-subfolder', label: t('client:project-tree.new-subfolder') },
      { key: 'new-function', label: t('client:project-tree.new-function-here') },
      { key: 'new-object', label: t('client:project-tree.new-object-here') },
      { type: 'divider' },
      { key: 'delete', label: t('client:project-tree.delete-folder'), danger: true },
    ];
  }
  const doc = store.documents.find((item) => item.id === idOf(nodeKey));
  if (doc?.pinned) return [];
  return [{ key: 'delete', label: t('client:project-tree.delete'), danger: true }];
};

export const ProjectTree: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
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
      if (key.startsWith('doc:')) {
        store.openTab(idOf(key));
      } else if (key.startsWith('folder:'))
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
        else if (!store.documents.find((item) => item.id === idOf(nodeKey))?.pinned)
          store.deleteDocument(idOf(nodeKey));
      } else if (key === 'new-subfolder') {
        setNewItem({ type: 'folder', parentId: idOf(nodeKey), name: '' });
      } else if (key === 'new-function') {
        setNewItem({ type: 'function', parentId, name: '' });
      } else if (key === 'new-object') {
        setNewItem({ type: 'objects-structure', parentId, name: '' });
      }
    },
    [contextMenu, store],
  );

  const handleAllowDrop = useCallback(
    (options: { dragNode: { key: React.Key }; dropNode: { key: React.Key }; dropPosition: number }) => {
      const dropKey = String(options.dropNode.key);
      const dragKey = String(options.dragNode.key);
      if (dragKey.startsWith('doc:') && store.documents.find((item) => item.id === idOf(dragKey))?.pinned) {
        return false;
      }
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
        message.warning(t('client:project-tree.invalid-function-name'));
        return;
      }
      if (newItem.type === 'folder') store.createFolder(name, newItem.parentId);
      else store.createDocument(newItem.type, name, newItem.parentId);
    }
    setNewItem(null);
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateItem();
    if (e.key === 'Escape') setNewItem(null);
  };

  const handleAddMenuClick = ({ key }: { key: string }) => {
    if (key === 'trigger') setTriggerModalOpen(true);
    else if (key === 'folder') setNewItem({ type: 'folder', parentId: null, name: '' });
    else setNewItem({ type: key as DocumentType, parentId: null, name: '' });
  };

  const handleCreateTrigger = (name: string, data: INewTriggerData) => {
    const descriptor = REGISTERED_INTEGRATIONS.flatMap((integration) => integration.triggers).find(
      (trigger) => trigger.name === data.triggerName,
    );
    if (!descriptor) return;
    store.createTriggerFunctionDocument(name, {
      ...data,
      scopeVariableName: descriptor.scopeVariableName,
      scopeType: descriptor.scopeType,
    });
  };

  return (
    <div style={S.root}>
      <style>{'.ant-tree-switcher{display:none!important}'}</style>
      <div style={S.header}>
        <span style={S.headerTitle}>{t('client:project-tree.header')}</span>
        <Dropdown menu={{ items: getAddMenuItems(t), onClick: handleAddMenuClick }} trigger={['click']}>
          <button style={S.addBtn}>{t('client:project-tree.add')}</button>
        </Dropdown>
      </div>

      {newItem && (
        <div style={S.newRow}>
          <span>{ITEM_ICONS[newItem.type]}</span>
          <input
            autoFocus
            style={S.newInput}
            value={newItem.name}
            placeholder={getPlaceholders(t)[newItem.type]}
            onChange={(e) => setNewItem((item) => (item ? { ...item, name: e.target.value } : null))}
            onKeyDown={handleNewItemKeyDown}
            onBlur={handleCreateItem}
          />
          <span style={S.hint}>
            {t('client:project-tree.in-folder', { folder: getFolderLabel(store, newItem.parentId, t) })}
          </span>
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
        {treeData.length === 0 && !newItem && <div style={S.empty}>{t('client:project-tree.no-documents')}</div>}
      </div>

      <NewTriggerModal
        open={triggerModalOpen}
        onClose={() => setTriggerModalOpen(false)}
        onCreate={handleCreateTrigger}
      />

      {contextMenu && (
        <div style={{ ...S.ctxWrap, top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <Menu items={getMenuItems(store, contextMenu.nodeKey, t)} onClick={handleMenuClick} style={S.ctxMenu} />
        </div>
      )}
    </div>
  );
});
