import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { ConfigProvider, Dropdown, Menu, message, Tree } from 'antd';
import type { MenuProps, TreeDataNode } from 'antd';
import { validateDocumentName } from '../document-names.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import type { DocumentType } from '../workflow-types.js';
import { S } from './project-tree.styles.js';
import { useProjectTreeRename } from './project-tree-rename.js';
import { NewTriggerModal, type INewTriggerData } from './new-trigger-modal.js';
import { idOf, getSectionLabel, toTreeData, getFolderLabel, getMenuItems } from './project-tree-helpers.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { buildProjectTreeNodes, canDropInProject, loadExpandedKeys, saveExpandedKeys } from './project-tree-model.js';

const getAddMenuItems = (t: TFunction): MenuProps['items'] => [
  { key: 'function', label: t('client:project-tree.add-function') },
  { key: 'trigger', label: t('client:project-tree.add-trigger') },
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

export const ProjectTree: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const { startRename, renameModal, nameErrorMessage } = useProjectTreeRename(store);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [triggerTargetFolderId, setTriggerTargetFolderId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const prevFolderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const existing = prevFolderIdsRef.current;
    const isFirstLoad = existing.size === 0;
    const stored = isFirstLoad ? loadExpandedKeys(store.projectId) : null;
    const known = new Set(store.folders.map((f) => f.id));
    if (stored) {
      setExpandedKeys(stored.filter((key) => known.has(idOf(String(key)))));
    } else {
      const newKeys = store.folders.filter((f) => !existing.has(f.id)).map((f): React.Key => `folder:${f.id}`);
      if (newKeys.length > 0) setExpandedKeys((keys) => [...keys, ...newKeys]);
    }
    prevFolderIdsRef.current = known;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.folders.length]);

  useEffect(() => {
    if (store.folders.length > 0) saveExpandedKeys(store.projectId, expandedKeys.map(String));
  }, [expandedKeys, store.folders.length, store.projectId]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const treeData = toTreeData(
    buildProjectTreeNodes(store.folders, store.documents, getSectionLabel(t)),
    new Set(expandedKeys),
  );
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

  const resolveDropParent = useCallback(
    (dropKey: string, dropToGap: boolean): string | null => {
      if (!dropToGap && dropKey.startsWith('folder:')) return idOf(dropKey);
      if (dropKey.startsWith('folder:')) return store.folders.find((f) => f.id === idOf(dropKey))?.parentId ?? null;
      return store.documents.find((d) => d.id === idOf(dropKey))?.folderId ?? null;
    },
    [store],
  );

  const handleDrop = useCallback(
    (info: { dragNode: { key: React.Key }; node: { key: React.Key }; dropToGap: boolean }) => {
      const dragKey = String(info.dragNode.key);
      const targetParentId = resolveDropParent(String(info.node.key), info.dropToGap);
      if (dragKey.startsWith('folder:')) {
        store.moveFolder(idOf(dragKey), targetParentId);
      } else {
        store.moveDocument(idOf(dragKey), targetParentId);
      }
    },
    [store, resolveDropParent],
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
      if (key === 'new-trigger') {
        setTriggerTargetFolderId(parentId);
        setTriggerModalOpen(true);
        return;
      }
      if (key === 'rename') {
        startRename(nodeKey);
        return;
      }
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
      if (options.dropPosition === 0 && dropKey.startsWith('doc:')) return false;
      // `dropPosition` 0 drops into the node; otherwise the item lands next to it (-1/1 = a gap).
      const targetParentId = resolveDropParent(dropKey, options.dropPosition !== 0);
      const drag = { kind: dragKey.startsWith('folder:') ? ('folder' as const) : ('doc' as const), id: idOf(dragKey) };
      return canDropInProject(drag, targetParentId, store.folders, store.documents);
    },
    [store, resolveDropParent],
  );

  const handleCreateItem = () => {
    if (!newItem) return;
    const name = newItem.name.trim();
    if (name) {
      const nameError = newItem.type === 'folder' ? null : validateDocumentName(store.documents, newItem.type, name);
      if (nameError) {
        message.warning(nameErrorMessage(nameError));
        return;
      }
      if (newItem.type === 'folder') store.createFolder(name, newItem.parentId);
      else store.createDocument(newItem.type, name, newItem.parentId);
      if (newItem.parentId) {
        const key = `folder:${newItem.parentId}`;
        setExpandedKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
      }
    }
    setNewItem(null);
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateItem();
    if (e.key === 'Escape') setNewItem(null);
  };

  const handleAddMenuClick = ({ key }: { key: string }) => {
    if (key === 'trigger') {
      setTriggerTargetFolderId(store.getSectionFolderId('trigger-function'));
      setTriggerModalOpen(true);
      return;
    }
    const parentId = store.getSectionFolderId(key);
    setNewItem({ type: key as DocumentType, parentId, name: '' });
    if (parentId)
      setExpandedKeys((keys) => (keys.includes(`folder:${parentId}`) ? keys : [...keys, `folder:${parentId}`]));
  };

  const handleCreateTrigger = (name: string, data: INewTriggerData) => {
    const descriptor = REGISTERED_INTEGRATIONS.flatMap((integration) => integration.triggers).find(
      (trigger) => trigger.name === data.triggerName,
    );
    if (!descriptor) return;
    store.createTriggerFunctionDocument(
      name,
      {
        ...data,
        scopeVariableName: descriptor.scopeVariableName,
        scopeType: descriptor.scopeType,
      },
      triggerTargetFolderId,
    );
    if (triggerTargetFolderId) {
      const key = `folder:${triggerTargetFolderId}`;
      setExpandedKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
    }
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
            draggable={{
              icon: false,
              nodeDraggable: (node) => !(node as TreeDataNode & { disableDrag?: boolean }).disableDrag,
            }}
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

      {renameModal}

      {contextMenu && (
        <div style={{ ...S.ctxWrap, top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <Menu items={getMenuItems(store, contextMenu.nodeKey, t)} onClick={handleMenuClick} style={S.ctxMenu} />
        </div>
      )}
    </div>
  );
});
