import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Tabs } from 'antd';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';

export const TabsBar: React.FC = observer(() => {
  const store = useDesktopProjectStore();
  if (store.openTabIds.length === 0) return null;

  const items = store.openTabIds
    .map((id) => {
      const doc = store.getDocument(id);
      if (!doc) return null;
      return { key: id, label: doc.name };
    })
    .filter(Boolean) as { key: string; label: string }[];

  return (
    <Tabs
      type="editable-card"
      hideAdd
      activeKey={store.activeTabId ?? ''}
      items={items}
      onChange={(id) => store.openTab(id)}
      onEdit={(id, action) => {
        if (action === 'remove') store.closeTab(id as string);
      }}
      style={{ flexShrink: 0, marginBottom: 0 }}
      size="small"
    />
  );
});
