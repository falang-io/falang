import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { ConfigProvider, Dropdown, Menu, Modal, Tree } from 'antd';
import type { TreeDataNode } from 'antd';
import { useWorkflowStore } from '../workflow-store-context.js';
import type { DocumentType } from '../workflow-types.js';
import { S } from './project-tree.styles.js';
import { useProjectTreeRename } from './project-tree-rename.js';
import { useProjectTreeCreate } from './project-tree-create.js';
import { NewTriggerModal, type INewTriggerData } from './new-trigger-modal.js';
import {
  idOf,
  getPinnedDocumentLabel,
  getSectionLabel,
  toTreeData,
  getMenuItems,
  getAddMenuItems,
} from './project-tree-helpers.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { buildProjectTreeNodes, canDropInProject, isFixedFolderKey } from './project-tree-model.js';
import { useProjectTreeExpansion } from './project-tree-expansion.js';

interface ContextMenuState {
  x: number;
  y: number;
  nodeKey: string;
}

export const ProjectTree: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const { startRename, renameModal, nameErrorMessage } = useProjectTreeRename(store);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [triggerTargetFolderId, setTriggerTargetFolderId] = useState<string | null>(null);
  const { expandedKeys, expandFolder, toggleFolder, handleExpand } = useProjectTreeExpansion(store);
  const { startCreate, createModal } = useProjectTreeCreate(store, nameErrorMessage, (parentId) => {
    if (parentId) expandFolder(parentId);
  });

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const treeData = toTreeData(
    buildProjectTreeNodes(store.folders, store.documents, getSectionLabel(t), getPinnedDocumentLabel(t)),
    new Set(expandedKeys),
  );
  const selectedKeys = store.activeTabId ? [`doc:${store.activeTabId}`] : [];

  const handleSelect = useCallback(
    (_keys: React.Key[], info: { node: { key: React.Key }; nativeEvent: MouseEvent }) => {
      const key = String(info.node.key);
      if (key.startsWith('doc:')) {
        store.openTab(idOf(key));
      } else if (isFixedFolderKey(key, store.folders)) {
        // A section folder can't be collapsed: a left click opens the same menu as a right click.
        if (store.readOnly) return;
        // Keep this click from reaching the document-level listener that closes the menu.
        info.nativeEvent.stopPropagation();
        setContextMenu({ x: info.nativeEvent.clientX, y: info.nativeEvent.clientY, nodeKey: key });
      } else if (key.startsWith('folder:')) toggleFolder(key);
    },
    [store, toggleFolder],
  );

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

  // Read-only (an admin viewing someone else's project): no "+ Add", no context menu, no drag-and-drop.
  const { readOnly } = store;
  const handleRightClick = useCallback(
    ({ event, node }: { event: React.MouseEvent; node: { key: React.Key } }) => {
      event.preventDefault();
      if (!store.readOnly) setContextMenu({ x: event.clientX, y: event.clientY, nodeKey: String(node.key) });
    },
    [store],
  );

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
        if (nodeKey.startsWith('folder:')) {
          store.deleteFolder(idOf(nodeKey));
        } else {
          const doc = store.documents.find((item) => item.id === idOf(nodeKey));
          if (!doc || doc.pinned) return;
          Modal.confirm({
            title: t('client:project-tree.delete-confirm', { name: doc.name }),
            okText: t('client:project-tree.delete'),
            cancelText: t('client:project-tree.cancel'),
            okButtonProps: { danger: true },
            onOk: () => store.deleteDocument(doc.id),
          });
        }
      } else if (key === 'new-subfolder') {
        startCreate('folder', idOf(nodeKey));
      } else if (key === 'new-function') {
        startCreate('function', parentId);
      } else if (key === 'new-object') {
        startCreate('objects-structure', parentId);
      } else if (key === 'new-table') {
        startCreate('table', parentId);
      }
    },
    [contextMenu, store, startRename, startCreate, t],
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

  const handleAddMenuClick = ({ key }: { key: string }) => {
    if (key === 'trigger') {
      setTriggerTargetFolderId(store.getSectionFolderId('trigger-function'));
      setTriggerModalOpen(true);
      return;
    }
    const parentId = store.getSectionFolderId(key);
    startCreate(key as DocumentType, parentId);
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
        scopeType: descriptor.scopeTypeFor?.(data.triggerConfig ?? {}) ?? descriptor.scopeType,
      },
      triggerTargetFolderId,
    );
    if (triggerTargetFolderId) expandFolder(triggerTargetFolderId);
  };

  return (
    <div style={S.root}>
      <style>{'.ant-tree-switcher{display:none!important}'}</style>
      <div style={S.header}>
        <span style={S.headerTitle}>{t('client:project-tree.header')}</span>
        {!readOnly && (
          <Dropdown menu={{ items: getAddMenuItems(t), onClick: handleAddMenuClick }} trigger={['click']}>
            <button style={S.addBtn}>{t('client:project-tree.add')}</button>
          </Dropdown>
        )}
      </div>

      <div style={S.list}>
        <ConfigProvider theme={{ token: { colorBgContainer: 'transparent', colorText: '#cdd6f4', fontSize: 13 } }}>
          <Tree
            treeData={treeData}
            showIcon
            switcherIcon={() => null}
            draggable={
              !readOnly && {
                icon: false,
                nodeDraggable: (node) => !(node as TreeDataNode & { disableDrag?: boolean }).disableDrag,
              }
            }
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
        {treeData.length === 0 && <div style={S.empty}>{t('client:project-tree.no-documents')}</div>}
      </div>

      <NewTriggerModal
        open={triggerModalOpen}
        onClose={() => setTriggerModalOpen(false)}
        onCreate={handleCreateTrigger}
      />

      {renameModal}
      {createModal}

      {contextMenu && (
        <div style={{ ...S.ctxWrap, top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <Menu items={getMenuItems(store, contextMenu.nodeKey, t)} onClick={handleMenuClick} style={S.ctxMenu} />
        </div>
      )}
    </div>
  );
});
