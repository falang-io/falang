import type React from 'react';
import { useEffect, useState } from 'react';
import { Empty, Table, Tag, Typography } from 'antd';
import type { IDocumentDiff, INodeChange, INodeTreeDiff, IProjectDiff } from '@falang/versioning';
import type { ISnapshotDocument } from '@falang/versioning';
import { CMD_ICON_MOUSE_CLICK, SchemeComponent, type Scheme } from '@falang/scheme';
import { useVersionHistoryT } from './use-version-history-t.js';

export type TVersionDiffSide = 'left' | 'right';

export const diffStyles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100%', minHeight: 0, gap: 12 },
  documentList: { width: 260, flexShrink: 0, overflow: 'auto', borderRight: '1px solid #313244' },
  documentItem: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer' },
  documentItemSelected: { background: 'rgba(255,255,255,0.08)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, gap: 8 },
  nav: { display: 'flex', alignItems: 'center', gap: 8 },
  canvases: { flex: 1, display: 'flex', minHeight: 0, gap: 8 },
  canvasHalf: { flex: 1, minWidth: 0, position: 'relative', border: '1px solid #313244', overflow: 'hidden' },
  detail: { flexShrink: 0, maxHeight: '30%', overflow: 'auto' },
};

const DOCUMENT_KIND_COLOR: Record<string, string> = { added: 'green', removed: 'red', modified: 'gold' };
const FOLDER_KIND_COLOR: Record<string, string> = { added: 'green', removed: 'red', renamed: 'gold', moved: 'blue' };

const formatValue = (value: unknown): React.ReactNode => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
  if (typeof text === 'string' && text.length > 80) {
    return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text}</pre>;
  }
  return text;
};

/** `INodeChange`/document-level field diffs rendered as an old/new table. */
export const FieldsTable: React.FC<{ fields: readonly { path: string; oldValue: unknown; newValue: unknown }[] }> = ({
  fields,
}) => {
  const t = useVersionHistoryT();
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="path"
      dataSource={[...fields]}
      columns={[
        { title: t('version-history:field'), dataIndex: 'path', width: '25%' },
        { title: t('version-history:old-value'), dataIndex: 'oldValue', render: formatValue },
        { title: t('version-history:new-value'), dataIndex: 'newValue', render: formatValue },
      ]}
    />
  );
};

export type TBuildReadOnlyScheme = (
  document: ISnapshotDocument,
  diff: INodeTreeDiff,
  side: TVersionDiffSide,
) => Scheme | null;

/** Builds (and disposes) the left/right read-only schemes for the currently selected document — a plain `useEffect` pair (not `useMemo`), see CLAUDE.md's ADR 0021 note on why construction and disposal must be paired in the same effect. */
export const useDiffSchemes = (
  leftDoc: ISnapshotDocument | null,
  rightDoc: ISnapshotDocument | null,
  tree: INodeTreeDiff | null,
  buildReadOnlyScheme: TBuildReadOnlyScheme,
): { readonly left: Scheme | null; readonly right: Scheme | null } => {
  const [schemes, setSchemes] = useState<{ left: Scheme | null; right: Scheme | null }>({ left: null, right: null });

  useEffect(() => {
    if (!tree) {
      setSchemes({ left: null, right: null });
      return;
    }
    const left = leftDoc ? buildReadOnlyScheme(leftDoc, tree, 'left') : null;
    const right = rightDoc ? buildReadOnlyScheme(rightDoc, tree, 'right') : null;
    setSchemes({ left, right });
    return () => {
      left?.dispose();
      right?.dispose();
    };
    // `tree`/`leftDoc`/`rightDoc` are fresh objects each time `store.comparison`/the selected
    // document changes; `buildReadOnlyScheme` is a stable host callback (matches
    // `WorkflowStore.buildReadOnlySchemeForDiff`'s own identity across renders in practice) and is
    // deliberately not a dependency here, otherwise a host that doesn't memoize it would rebuild
    // both schemes on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [leftDoc?.id, rightDoc?.id, tree]);

  return schemes;
};

/** Subscribes to `CMD_ICON_MOUSE_CLICK` on a read-only scheme (priority 4, same as the read-only mutation guards) so clicking a node in either canvas selects it for the detail pane below — registered/unregistered per scheme instance. */
export const useNodeClickSelection = (scheme: Scheme | null, onSelect: (nodeId: string) => void): void => {
  useEffect(() => {
    if (!scheme) return;
    const unregister = scheme.commands.registerCommand(
      CMD_ICON_MOUSE_CLICK,
      ({ icon }) => {
        onSelect(icon.id);
        return false;
      },
      4,
    );
    return unregister;
    // `onSelect` is a `setState` setter, stable across renders.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme]);
};

/** `currentIndex === -1` (nothing selected yet) starts at the first/last id depending on direction; otherwise wraps around. */
export const computeNextChangeIndex = (currentIndex: number, direction: 1 | -1, length: number): number => {
  if (currentIndex === -1) return direction === 1 ? 0 : length - 1;
  return (currentIndex + direction + length) % length;
};

export const DocumentListPane: React.FC<{
  readonly folders: IProjectDiff['folders'];
  readonly documents: readonly IDocumentDiff[];
  readonly selectedDocumentId: string | null;
  readonly onSelect: (documentId: string) => void;
}> = ({ folders, documents, selectedDocumentId, onSelect }) => {
  const t = useVersionHistoryT();
  return (
    <div style={diffStyles.documentList}>
      {folders.map((folder) => (
        <div key={folder.folderId} style={diffStyles.documentItem}>
          <Tag color={FOLDER_KIND_COLOR[folder.kind]}>{t(`version-history:folder-kind-${folder.kind}`)}</Tag>
          <Typography.Text type="secondary">{folder.name}</Typography.Text>
        </div>
      ))}
      {documents.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('version-history:no-changes')} />
      )}
      {documents.map((doc) => (
        <div
          key={doc.documentId}
          style={{
            ...diffStyles.documentItem,
            ...(doc.documentId === selectedDocumentId ? diffStyles.documentItemSelected : {}),
          }}
          onClick={() => onSelect(doc.documentId)}
        >
          <Tag color={DOCUMENT_KIND_COLOR[doc.kind]}>{t(`version-history:document-kind-${doc.kind}`)}</Tag>
          <Typography.Text>{doc.renamed ? `${doc.renamed.from} → ${doc.renamed.to}` : doc.name}</Typography.Text>
        </div>
      ))}
    </div>
  );
};

/** The right-hand side once a document is selected: either the two canvases + node detail (a tree diff exists) or a `custom` document's own field table, or an empty state. */
export const DiffBody: React.FC<{
  readonly tree: INodeTreeDiff | null;
  readonly dataFields: IDocumentDiff['dataFields'];
  readonly leftScheme: Scheme | null;
  readonly rightScheme: Scheme | null;
  readonly selectedChange: INodeChange | null;
}> = ({ tree, dataFields, leftScheme, rightScheme, selectedChange }) => {
  const t = useVersionHistoryT();
  if (tree) {
    return (
      <>
        <div style={diffStyles.canvases}>
          <div style={diffStyles.canvasHalf}>{leftScheme && <SchemeComponent scheme={leftScheme} />}</div>
          <div style={diffStyles.canvasHalf}>{rightScheme && <SchemeComponent scheme={rightScheme} />}</div>
        </div>
        <div style={diffStyles.detail}>
          {selectedChange?.fields && selectedChange.fields.length > 0 ? (
            <FieldsTable fields={selectedChange.fields} />
          ) : (
            <Typography.Text type="secondary">{t('version-history:select-a-node')}</Typography.Text>
          )}
        </div>
      </>
    );
  }
  if (dataFields && dataFields.length > 0) {
    return (
      <div style={diffStyles.detail}>
        <FieldsTable fields={dataFields} />
      </div>
    );
  }
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('version-history:no-changes')} />;
};
