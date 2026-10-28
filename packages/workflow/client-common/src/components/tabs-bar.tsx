import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Badge, Tabs } from 'antd';
import { CarryOutOutlined, FolderOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';
import type { TSystemTab } from '../workflow-store.js';

/** The error/warning count of a tab's document (ADR 0068 (private)); nothing while there are none or its scheme isn't built. */
const TabIssues: React.FC<{ docId: string }> = observer(({ docId }) => {
  const store = useWorkflowStore();
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

const SYSTEM_TAB_PREFIX = 'system:';

const SYSTEM_TAB_ICONS: Record<TSystemTab, React.ReactNode> = {
  files: <FolderOutlined />,
  tasks: <CarryOutOutlined />,
};

/** A system tab's title: its icon and name, plus the open-task count on "Tasks". */
const SystemTabLabel: React.FC<{ tab: TSystemTab }> = observer(({ tab }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const openTasks = tab === 'tasks' ? store.tasks.openCount : 0;
  return (
    <span data-testid={`system-tab-${tab}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {SYSTEM_TAB_ICONS[tab]}
      {t(`client:toolbar.${tab}`)}
      {openTasks > 0 && <Badge count={openTasks} size="small" />}
    </span>
  );
});

const isSystemKey = (key: string): boolean => key.startsWith(SYSTEM_TAB_PREFIX);
const toSystemTab = (key: string): TSystemTab => key.slice(SYSTEM_TAB_PREFIX.length) as TSystemTab;

/** The document tabs, then the open system tabs (Files, Tasks — `WorkflowStore.systemTabs`). */
export const TabsBar: React.FC = observer(() => {
  const store = useWorkflowStore();
  if (store.openTabIds.length === 0 && store.systemTabs.length === 0) return null;

  const documentItems = store.openTabIds
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
  const systemItems = store.systemTabs.map((tab) => ({
    key: `${SYSTEM_TAB_PREFIX}${tab}`,
    label: <SystemTabLabel tab={tab} />,
  }));
  const activeKey = store.activeView ? `${SYSTEM_TAB_PREFIX}${store.activeView}` : (store.activeTabId ?? '');

  return (
    <Tabs
      type="editable-card"
      hideAdd
      activeKey={activeKey}
      items={[...documentItems, ...systemItems]}
      onChange={(key) => (isSystemKey(key) ? store.setActiveView(toSystemTab(key)) : store.openTab(key))}
      onEdit={(key, action) => {
        if (action !== 'remove' || typeof key !== 'string') return;
        if (isSystemKey(key)) store.closeSystemTab(toSystemTab(key));
        else store.closeTab(key);
      }}
      style={{ flexShrink: 0, marginBottom: 0 }}
      size="small"
    />
  );
});
