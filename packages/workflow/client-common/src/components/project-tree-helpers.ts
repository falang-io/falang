import type React from 'react';
import type { TFunction } from '@falang/scheme';
import { isFixedFolder } from '@falang/workflow-dto';
import type { MenuProps, TreeDataNode } from 'antd';
import type { WorkflowStore } from '../workflow-store.js';
import {
  getDocumentMenuKeys,
  getFolderMenuKeys,
  type IProjectTreeNode,
  type TFolderMenuKey,
} from './project-tree-model.js';

export const DOC_ICONS: Record<string, string> = {
  function: '⚙',
  'objects-structure': '📦',
  integrations: '🔌',
  constants: '🔤',
  'trigger-function': '⚡',
  'section:triggers': '⚡',
  'section:functions': '⚙',
  'section:types': '📦',
  'section:tables': '▦',
  table: '▦',
};

export const getAddMenuItems = (t: TFunction): MenuProps['items'] => [
  { key: 'function', label: t('client:project-tree.add-function') },
  { key: 'trigger', label: t('client:project-tree.add-trigger') },
  { key: 'objects-structure', label: t('client:project-tree.add-object') },
  { key: 'table', label: t('client:project-tree.add-table') },
];
export const ITEM_ICONS: Record<string, string> = {
  folder: '📁',
  function: '⚙',
  'objects-structure': '📦',
  table: '▦',
};
export const getPlaceholders = (t: TFunction): Record<string, string> => ({
  folder: t('client:project-tree.folder-placeholder'),
  function: t('client:project-tree.function-placeholder'),
  'objects-structure': t('client:project-tree.object-placeholder'),
  table: t('client:project-tree.table-placeholder'),
});

export const idOf = (k: string) => k.slice(k.indexOf(':') + 1);

export const getSectionLabel = (t: TFunction) => (kind: string, fallback: string) => {
  const key = `client:project-tree.section-${kind}`;
  const label = t(key);
  return label === key ? fallback : label;
};

export const nodeIcon = (node: IProjectTreeNode, expandedKeys: Set<React.Key>): string | undefined => {
  if (node.isLeaf || node.iconKind.startsWith('section:')) return DOC_ICONS[node.iconKind];
  return expandedKeys.has(node.key) ? '📂' : '📁';
};

export const toTreeData = (nodes: IProjectTreeNode[], expandedKeys: Set<React.Key>): TreeDataNode[] =>
  nodes.map((node) => ({
    key: node.key,
    title: node.title,
    icon: nodeIcon(node, expandedKeys),
    isLeaf: node.isLeaf,
    disableDrag: node.disableDrag,
    ...(node.children ? { children: toTreeData(node.children, expandedKeys) } : {}),
  }));

export const getFolderLabel = (store: WorkflowStore, id: string | null, t: TFunction): string => {
  if (!id) return t('client:project-tree.root');
  const folder = store.folders.find((f) => f.id === id);
  if (!folder) return t('client:project-tree.folder-fallback');
  return isFixedFolder(folder) ? getSectionLabel(t)(folder.fixedKind as string, folder.name) : folder.name;
};

export const FOLDER_MENU_LABELS: Record<TFolderMenuKey, string> = {
  'new-subfolder': 'client:project-tree.new-subfolder',
  'new-trigger': 'client:project-tree.new-trigger-here',
  'new-function': 'client:project-tree.new-function-here',
  'new-object': 'client:project-tree.new-object-here',
  'new-table': 'client:project-tree.new-table-here',
  rename: 'client:project-tree.rename',
  delete: 'client:project-tree.delete-folder',
};

export const getMenuItems = (store: WorkflowStore, nodeKey: string, t: TFunction): MenuProps['items'] => {
  if (nodeKey.startsWith('folder:')) {
    return getFolderMenuKeys(idOf(nodeKey), store.folders).flatMap(
      (key): NonNullable<MenuProps['items']> =>
        key === 'delete'
          ? [{ type: 'divider' }, { key, label: t(FOLDER_MENU_LABELS[key]), danger: true }]
          : [{ key, label: t(FOLDER_MENU_LABELS[key]) }],
    );
  }
  const doc = store.documents.find((item) => item.id === idOf(nodeKey));
  return getDocumentMenuKeys(doc).map((key) =>
    key === 'delete'
      ? { key, label: t('client:project-tree.delete'), danger: true }
      : { key, label: t('client:project-tree.rename') },
  );
};
