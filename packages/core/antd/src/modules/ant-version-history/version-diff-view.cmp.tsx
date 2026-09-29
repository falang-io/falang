import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Modal, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { INodeChange, IProjectDiff } from '@falang/versioning';
import { changeIdsForSide, scrollToNode } from '@falang/scheme';
import {
  computeNextChangeIndex,
  DiffBody,
  diffStyles,
  DocumentListPane,
  useDiffSchemes,
  useNodeClickSelection,
  type TBuildReadOnlyScheme,
} from './version-diff-parts.cmp.js';
import { useVersionHistoryT } from './use-version-history-t.js';
import type { VersionHistoryStore } from './version-history.store.js';

export type { TVersionDiffSide } from './version-diff-parts.cmp.js';

export interface IVersionDiffViewProps {
  readonly store: VersionHistoryStore;
  /** The host builds a read-only scheme for one document/side, registering `VersionDiffModule({ diff, side })` itself — see `WorkflowStore.buildReadOnlySchemeForDiff`. `null` for a document type with no scheme editor (e.g. a `custom` document like `integrations`). */
  readonly buildReadOnlyScheme: TBuildReadOnlyScheme;
  readonly onClose: () => void;
}

/**
 * The split diff view (ADR 0025 (private), "The diff UI"): a left column of
 * changed documents/folders, the selected document as two read-only canvases side by side, a
 * next/previous-change navigator, and a bottom detail pane with the selected node's (or, for a
 * `custom` document, the whole document's) field-level old/new values. Rendering is split across
 * `version-diff-parts.cmp.tsx` (this file stays under the repo's 300-line lint cap).
 */
export const VersionDiffView: React.FC<IVersionDiffViewProps> = observer(({ store, buildReadOnlyScheme, onClose }) => {
  const t = useVersionHistoryT();
  const comparison = store.comparison;
  const diff: IProjectDiff | null = comparison?.diff ?? null;

  const changedDocuments = useMemo(() => diff?.documents.filter((doc) => doc.kind !== 'unchanged') ?? [], [diff]);
  const changedFolders = diff?.folders ?? [];

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDocumentId(changedDocuments[0]?.documentId ?? null);
    setSelectedNodeId(null);
    // Only re-pick a default when the comparison itself changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison]);

  const selectedDocDiff = changedDocuments.find((doc) => doc.documentId === selectedDocumentId) ?? null;
  const tree = selectedDocDiff?.tree ?? null;

  const leftDoc = comparison?.leftSnapshot.documents.find((doc) => doc.id === selectedDocumentId) ?? null;
  const rightDoc = comparison?.rightSnapshot.documents.find((doc) => doc.id === selectedDocumentId) ?? null;

  const { left: leftScheme, right: rightScheme } = useDiffSchemes(
    tree ? leftDoc : null,
    tree ? rightDoc : null,
    tree,
    buildReadOnlyScheme,
  );

  useNodeClickSelection(leftScheme, setSelectedNodeId);
  useNodeClickSelection(rightScheme, setSelectedNodeId);

  const combinedChangeIds = useMemo(() => {
    if (!tree) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of [...changeIdsForSide(tree, 'left'), ...changeIdsForSide(tree, 'right')]) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }, [tree]);

  const goToChange = (direction: 1 | -1): void => {
    if (combinedChangeIds.length === 0) return;
    const currentIndex = selectedNodeId ? combinedChangeIds.indexOf(selectedNodeId) : -1;
    const nextId = combinedChangeIds[computeNextChangeIndex(currentIndex, direction, combinedChangeIds.length)];
    setSelectedNodeId(nextId);
    if (leftScheme) scrollToNode(leftScheme, nextId);
    if (rightScheme) scrollToNode(rightScheme, nextId);
  };

  const selectedChange: INodeChange | null = tree?.changes.find((change) => change.id === selectedNodeId) ?? null;

  return (
    <div className="version-diff-view" style={diffStyles.root}>
      <DocumentListPane
        folders={changedFolders}
        documents={changedDocuments}
        selectedDocumentId={selectedDocumentId}
        onSelect={setSelectedDocumentId}
      />
      <div style={diffStyles.main}>
        <div style={diffStyles.nav}>
          <Button size="small" onClick={onClose}>
            {t('version-history:close')}
          </Button>
          {tree && (
            <Space>
              <Button
                size="small"
                icon={<LeftOutlined />}
                disabled={combinedChangeIds.length === 0}
                onClick={() => goToChange(-1)}
              >
                {t('version-history:previous-change')}
              </Button>
              <Button
                size="small"
                icon={<RightOutlined />}
                disabled={combinedChangeIds.length === 0}
                onClick={() => goToChange(1)}
              >
                {t('version-history:next-change')}
              </Button>
            </Space>
          )}
        </div>
        <DiffBody
          tree={tree}
          dataFields={selectedDocDiff?.dataFields}
          leftScheme={leftScheme}
          rightScheme={rightScheme}
          selectedChange={selectedChange}
        />
      </div>
    </div>
  );
});

export interface IVersionDiffModalProps extends IVersionDiffViewProps {
  readonly open: boolean;
}

/** `VersionDiffView` inside a near-fullscreen `Modal` — the host opens/closes it (`ProjectWorkspace`'s `diffModalOpen`). */
export const VersionDiffModal: React.FC<IVersionDiffModalProps> = ({ open, ...props }) => (
  <Modal
    open={open}
    onCancel={props.onClose}
    footer={null}
    width="95vw"
    style={{ top: 16, paddingBottom: 0 }}
    styles={{ body: { height: '88vh', overflow: 'hidden' } }}
    destroyOnHidden
  >
    <VersionDiffView {...props} />
  </Modal>
);
