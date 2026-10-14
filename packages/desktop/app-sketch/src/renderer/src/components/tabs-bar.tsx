import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Tabs } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';

/** The error/warning count of a tab's document (ADR 0068 (private)); nothing while there are none or its scheme isn't built. */
const TabIssues: React.FC<{ docId: string }> = observer(({ docId }) => {
  const store = useDesktopProjectStore();
  const { errors, warnings } = store.getValidationCounts(docId);
  if (errors === 0 && warnings === 0) return null;
  const isError = errors > 0;
  const color = isError ? '#d93025' : '#f5a623';
  const t = getGlobalI18n().t;
  return (
    <span
      data-testid={isError ? 'document-tab-errors' : 'document-tab-warnings'}
      title={t(isError ? 'validation:pill-errors' : 'validation:pill-warnings', { count: isError ? errors : warnings })}
      style={{
        marginLeft: 6,
        padding: '0 6px',
        borderRadius: 8,
        background: color,
        color: '#fff',
        font: '600 11px/16px sans-serif',
      }}
    >
      {isError ? errors : warnings}
    </span>
  );
});

export const TabsBar: React.FC = observer(() => {
  const store = useDesktopProjectStore();
  if (store.openTabIds.length === 0) return null;

  const items = store.openTabIds
    .map((id) => {
      const doc = store.getDocument(id);
      if (!doc) return null;
      return {
        key: id,
        label: (
          <span>
            {doc.name}
            <TabIssues docId={id} />
          </span>
        ),
      };
    })
    .filter(Boolean) as { key: string; label: React.ReactNode }[];

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
