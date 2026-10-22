import type React from 'react';
import { List, Tag, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import type { IArduinoCliDiagnostic, IArduinoCompileProblem } from '../../../shared/arduino-sketch-code.js';
import type { ISketchCodeFocus } from '../sketch-code-viewer-store.js';

interface Props {
  /** falang's own compile failures (before `arduino-cli`). */
  readonly problems: readonly IArduinoCompileProblem[];
  /** gcc diagnostics from `arduino-cli`. */
  readonly diagnostics: readonly IArduinoCliDiagnostic[];
  /** A row attributed to a document (and maybe a node) was clicked. */
  readonly onJumpToNode: (documentId: string, nodeId?: string) => void;
  /** A diagnostic's `file:line` was clicked, or a row with no document behind it. */
  readonly onShowInCode: (focus: ISketchCodeFocus) => void;
}

interface IRow {
  readonly key: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly documentId?: string;
  readonly documentName?: string;
  readonly nodeId?: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

const severityRank = (severity: 'error' | 'warning'): number => (severity === 'error' ? 0 : 1);

const toRows = (
  problems: readonly IArduinoCompileProblem[],
  diagnostics: readonly IArduinoCliDiagnostic[],
): readonly IRow[] => [
  ...problems.map((problem, index) => ({ key: `p${String(index)}`, severity: 'error' as const, ...problem })),
  // Errors before warnings; gcc's own order within each (`toSorted` is stable).
  ...diagnostics
    .map((diagnostic, index) => ({ key: `d${String(index)}`, ...diagnostic }))
    .toSorted((a, b) => severityRank(a.severity) - severityRank(b.severity)),
];

const fileLocation = (row: IRow): string =>
  [row.file ?? '', ...(row.line ? [row.line] : []), ...(row.column ? [row.column] : [])].join(':');

/**
 * The build's problems, one row each, shared by the build panel and the code viewer. A row produced by a document jumps
 * to it — to the node, when the line or the failure is attributed to one; a gcc diagnostic's `file:line` link (and a row
 * with no document behind it: a driver file, the preamble) opens the generated code at that line instead.
 */
export const SketchProblemsList: React.FC<Props> = ({ problems, diagnostics, onJumpToNode, onShowInCode }) => {
  const t = getGlobalI18n().t;
  const rows = toRows(problems, diagnostics);
  if (rows.length === 0) return null;

  const handleClick = (row: IRow): void => {
    if (row.documentId) onJumpToNode(row.documentId, row.nodeId);
    else if (row.file && row.line) onShowInCode({ path: row.file, line: row.line });
  };

  return (
    <List
      size="small"
      bordered
      data-testid="sketch-problems"
      style={{ maxHeight: 220, overflow: 'auto' }}
      dataSource={[...rows]}
      renderItem={(row) => {
        const clickable = Boolean(row.documentId ?? (row.file && row.line));
        return (
          <List.Item
            key={row.key}
            data-testid="sketch-problem"
            {...(clickable ? { onClick: () => handleClick(row) } : {})}
            style={{ cursor: clickable ? 'pointer' : 'default', display: 'block' }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Tag color={row.severity === 'error' ? 'error' : 'warning'} style={{ marginInlineEnd: 0 }}>
                {row.severity === 'error'
                  ? t('desktop-app-arduino:sketch-problems.error')
                  : t('desktop-app-arduino:sketch-problems.warning')}
              </Tag>
              {row.documentName && <Typography.Text strong>{row.documentName}</Typography.Text>}
              {row.documentId && !row.nodeId && (
                <Typography.Text type="secondary">{t('desktop-app-arduino:sketch-problems.no-node')}</Typography.Text>
              )}
              {row.file && row.line && (
                <Typography.Link
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  title={t('desktop-app-arduino:sketch-problems.show-in-code')}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (row.file && row.line) onShowInCode({ path: row.file, line: row.line });
                  }}
                >
                  {fileLocation(row)}
                </Typography.Link>
              )}
            </div>
            <Typography.Text
              type={row.severity === 'error' ? 'danger' : 'warning'}
              style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}
            >
              {row.message}
            </Typography.Text>
          </List.Item>
        );
      }}
    />
  );
};
