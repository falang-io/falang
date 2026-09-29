import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Tabs } from 'antd';
import { workflowStore } from '../workflow-store.js';

export const TabsBar: React.FC = observer(() => {
  if (workflowStore.openTabIds.length === 0) return null;

  const items = workflowStore.openTabIds
    .map((id) => {
      const doc = workflowStore.getDocument(id);
      if (!doc) return null;
      return { key: id, label: doc.name };
    })
    .filter(Boolean) as { key: string; label: string }[];

  return (
    <Tabs
      type="editable-card"
      hideAdd
      activeKey={workflowStore.activeTabId ?? ''}
      items={items}
      onChange={(id) => workflowStore.openTab(id)}
      onEdit={(id, action) => {
        if (action === 'remove') workflowStore.closeTab(id as string);
      }}
      style={{ flexShrink: 0, marginBottom: 0 }}
      size="small"
    />
  );
});
