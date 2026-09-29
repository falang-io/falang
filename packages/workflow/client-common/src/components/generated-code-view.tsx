import type React from 'react';
import { useMemo } from 'react';
import { Tabs } from 'antd';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import { parseCompiledMarkers, resolveMarkerLocation, type IMarkerLocation } from '@falang/workflow-compiler';
import { useWorkflowStore } from '../workflow-store-context.js';
import './generated-code-view.css';

interface IFile {
  readonly path: string;
  readonly content: string;
}

interface Props {
  readonly files: readonly IFile[];
  /** Called after a clicked line has opened/selected its node — lets the caller (e.g. close the modal) so the canvas is actually visible. */
  readonly onNavigate?: () => void;
}

interface ICodeLinesProps {
  readonly content: string;
  readonly onLineClick: (location: IMarkerLocation) => void;
}

/**
 * Renders `content` as one syntax-highlighted, clickable row per line. Lines are highlighted
 * individually (rather than the whole file through `Prism.highlight` once) so a per-line click
 * handler can be attached directly to each row instead of having to re-derive line boundaries from
 * Prism's HTML output. Markers are parsed once per file; `resolveMarkerLocation` is then queried per
 * line — a line falls inside a `doc-start`/`icon-start` span (including the marker comment lines
 * themselves, since spans are inclusive of their own start/end lines) whenever it was produced by
 * that document/node.
 */
const CodeLines: React.FC<ICodeLinesProps> = ({ content, onLineClick }) => {
  const lines = useMemo(() => content.split('\n'), [content]);
  const markers = useMemo(() => parseCompiledMarkers(content), [content]);

  return (
    <div className="falang-code-view">
      {lines.map((line, index) => {
        const location = resolveMarkerLocation(markers, index);
        const clickable = Boolean(location.documentId);
        return (
          <div
            key={index}
            className={`falang-code-view__line${clickable ? ' falang-code-view__line--clickable' : ''}`}
            onClick={() => onLineClick(location)}
          >
            <span className="falang-code-view__line-number">{index + 1}</span>
            <span
              className="falang-code-view__line-content"
              dangerouslySetInnerHTML={{ __html: Prism.highlight(line, Prism.languages.typescript, 'typescript') }}
            />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Renders every generated file — one code block if there's just one, tabbed by path once there's
 * more (e.g. a separate activities module). Shared by `CodeViewerModal` (a successful `GET /code`)
 * and `BuildErrorsModal` (the compiled-or-partially-compiled code accompanying a failed build).
 * Every line is prismjs-highlighted, and clicking one jumps to the document/node that produced it
 * (via the `doc-start`/`icon-start` markers `compileProject` instruments the output with — see
 * `parse-compiled-markers.ts`); lines outside every marker (e.g. the preamble) aren't clickable.
 */
export const GeneratedCodeView: React.FC<Props> = ({ files, onNavigate }) => {
  const store = useWorkflowStore();

  const handleLineClick = (location: IMarkerLocation): void => {
    if (!location.documentId) return;
    store.jumpToNode(location.documentId, location.nodeId);
    onNavigate?.();
  };

  if (files.length === 0) return null;
  if (files.length === 1) return <CodeLines content={files[0].content} onLineClick={handleLineClick} />;
  return (
    <Tabs
      items={files.map((file) => ({
        key: file.path,
        label: file.path,
        children: <CodeLines content={file.content} onLineClick={handleLineClick} />,
      }))}
    />
  );
};
