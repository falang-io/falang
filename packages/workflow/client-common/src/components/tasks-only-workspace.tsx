import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Empty, Menu, Tabs } from 'antd';
import type { ITableSummary } from '@falang/workflow-dto';
import { workflowApi } from '../api-client.js';
import { TableEditor } from './table-editor/table-editor.js';
import { FalangBrand, navButtonStyle } from './app-header.js';
import { TasksPage } from './tasks-page.js';
import { UserMenu } from './user-menu.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#1e1e2e' },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px',
    height: 52,
    background: '#181825',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  name: { color: '#cdd6f4', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  spacer: { flex: 1 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
};

/** The project's tables, read-only: the fields come from `GET /projects/:id/tables` (an executor cannot read documents). */
const TablesView: React.FC<{ projectId: string }> = ({ projectId }) => {
  const t = getGlobalI18n().t;
  const [tables, setTables] = useState<ITableSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    workflowApi
      .listTables(projectId)
      .then((list) => {
        setTables(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch(() => setTables([]));
  }, [projectId]);

  const selected = tables?.find((table) => table.id === selectedId) ?? null;
  if (tables !== null && tables.length === 0)
    return <Empty style={{ margin: 'auto' }} description={t('client:table-editor.no-tables')} />;
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }} data-testid="tasks-only-tables">
      <Menu
        style={{ width: 220, flexShrink: 0 }}
        selectedKeys={selectedId ? [selectedId] : []}
        items={(tables ?? []).map((table) => ({ key: table.id, label: table.name }))}
        onClick={({ key }) => setSelectedId(key)}
      />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        {selected && (
          <TableEditor
            key={selected.id}
            projectId={projectId}
            tableId={selected.id}
            name={selected.name}
            data={{ fields: selected.fields, nextFieldNo: selected.nextFieldNo }}
            readOnly
          />
        )}
      </div>
    </div>
  );
};

/** An executor-only member's view of a project (ADR 0070 (private)): its Tasks page and its tables (read-only), nothing else. */
export const TasksOnlyWorkspace: React.FC<{ projectId: string; name: string }> = ({ projectId, name }) => {
  const t = getGlobalI18n().t;
  return (
    <div style={styles.root} data-testid="tasks-only-workspace">
      <div style={styles.bar}>
        <FalangBrand compact />
        <span style={styles.name}>{name}</span>
        <span style={styles.spacer} />
        <UserMenu style={navButtonStyle(false)} />
      </div>
      <Tabs
        style={{ flex: 1, minHeight: 0, padding: '0 16px', display: 'flex', flexDirection: 'column' }}
        items={[
          {
            key: 'tasks',
            label: t('client:toolbar.tasks'),
            children: (
              <div style={{ ...styles.body, height: 'calc(100vh - 110px)' }}>
                <TasksPage projectId={projectId} />
              </div>
            ),
          },
          {
            key: 'tables',
            label: t('client:table-editor.tab-tables'),
            children: (
              <div style={{ ...styles.body, height: 'calc(100vh - 110px)' }}>
                <TablesView projectId={projectId} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};
