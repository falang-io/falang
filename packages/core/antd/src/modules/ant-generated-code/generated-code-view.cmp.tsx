import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';
import Tabs from 'antd/es/tabs';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import { parseCompiledMarkers, resolveMarkerLocation, type IMarkerLocation } from '@falang/debug';

export interface IGeneratedCodeFile {
  readonly path: string;
  readonly content: string;
}

/** A compiler diagnostic drawn on a line — the line is tinted and the message shown as its tooltip. */
export interface IGeneratedCodeLineMark {
  readonly path: string;
  /** 1-based. */
  readonly line: number;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

/** A clicked line: where it is and, from the `doc-start`/`icon-start` markers around it, which document/node produced it. */
export interface IGeneratedCodeLocation extends IMarkerLocation {
  readonly path: string;
  /** 1-based. */
  readonly line: number;
}

export type TGeneratedCodeLanguage = 'typescript' | 'cpp';

interface Props {
  readonly files: readonly IGeneratedCodeFile[];
  /** Prism grammar used for every file. `cpp` also covers `.ino`/`.h`. Default `typescript`. */
  readonly language?: TGeneratedCodeLanguage;
  /** Called for a click on a line produced by a document (inside a `doc-start` marker); other lines aren't clickable. */
  readonly onLineClick?: (location: IGeneratedCodeLocation) => void;
  readonly marks?: readonly IGeneratedCodeLineMark[];
  /** Opens this file's tab and scrolls the line into view (e.g. a compile error picked in a list). */
  readonly focus?: { readonly path: string; readonly line: number } | null;
}

const CodeContainer = styled.div`
  margin: 0;
  padding: 12px 0;
  background: #11111b;
  color: #cdd6f4;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  max-height: 65vh;

  .falang-code-view__line {
    display: flex;
    padding: 0 12px;
    white-space: pre;
  }
  .falang-code-view__line--clickable {
    cursor: pointer;
  }
  .falang-code-view__line--clickable:hover {
    background: #313244;
  }
  .falang-code-view__line--warning {
    background: rgba(249, 226, 175, 0.12);
  }
  .falang-code-view__line--error {
    background: rgba(243, 139, 168, 0.18);
  }
  .falang-code-view__line--focused {
    outline: 1px solid #89b4fa;
    outline-offset: -1px;
  }
  .falang-code-view__line-number {
    flex: 0 0 auto;
    width: 3em;
    margin-right: 12px;
    text-align: right;
    color: #6c7086;
    user-select: none;
  }
  .falang-code-view__line--error .falang-code-view__line-number {
    color: #f38ba8;
  }
  .falang-code-view__line--warning .falang-code-view__line-number {
    color: #f9e2af;
  }
  .falang-code-view__line-content {
    flex: 1 1 auto;
  }
  /* The host's global Prism theme (the scheme editor's, injected later into <head>) gives .token.operator a light
     background; scoped through the line content so this rule outranks it. */
  .falang-code-view__line-content .token {
    background: none;
  }
  .token.comment {
    color: #6c7086;
    font-style: italic;
  }
  .token.string,
  .token.template-string,
  .token.char {
    color: #a6e3a1;
  }
  .token.number,
  .token.boolean {
    color: #fab387;
  }
  .token.keyword,
  .token.directive,
  .token.macro {
    color: #cba6f7;
  }
  .token.function {
    color: #89b4fa;
  }
  .token.class-name {
    color: #f9e2af;
  }
  .token.operator,
  .token.punctuation {
    color: #9399b2;
  }
`;

interface ICodeLinesProps {
  readonly path: string;
  readonly content: string;
  readonly language: TGeneratedCodeLanguage;
  readonly marks: readonly IGeneratedCodeLineMark[];
  readonly focusLine: number | null;
  readonly onLineClick?: (location: IGeneratedCodeLocation) => void;
}

const lineClassName = (clickable: boolean, marks: readonly IGeneratedCodeLineMark[], focused: boolean): string => {
  const classes = ['falang-code-view__line'];
  if (clickable) classes.push('falang-code-view__line--clickable');
  if (marks.some((mark) => mark.severity === 'error')) classes.push('falang-code-view__line--error');
  else if (marks.length > 0) classes.push('falang-code-view__line--warning');
  if (focused) classes.push('falang-code-view__line--focused');
  return classes.join(' ');
};

/**
 * One syntax-highlighted, clickable row per line. Lines are highlighted individually (rather than the whole file through
 * `Prism.highlight` once) so a click handler can sit on each row without re-deriving line boundaries from Prism's HTML.
 * Markers are parsed once per file; `resolveMarkerLocation` is queried per line — a line inside a `doc-start`/`icon-start`
 * span (including the marker comment lines themselves) was produced by that document/node.
 */
const CodeLines: React.FC<ICodeLinesProps> = ({ path, content, language, marks, focusLine, onLineClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => content.split('\n'), [content]);
  const markers = useMemo(() => parseCompiledMarkers(content), [content]);
  const highlighted = useMemo(
    () => lines.map((line) => Prism.highlight(line, Prism.languages[language], language)),
    [lines, language],
  );
  const marksByLine = useMemo(() => {
    const byLine = new Map<number, IGeneratedCodeLineMark[]>();
    for (const mark of marks) byLine.set(mark.line, [...(byLine.get(mark.line) ?? []), mark]);
    return byLine;
  }, [marks]);

  useEffect(() => {
    if (focusLine === null) return;
    containerRef.current
      ?.querySelector(`[data-line="${String(focusLine)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [focusLine, content]);

  return (
    <CodeContainer className="falang-code-view" ref={containerRef} data-testid="generated-code-view">
      {lines.map((_, index) => {
        const lineNumber = index + 1;
        const location = resolveMarkerLocation(markers, index);
        const clickable = Boolean(onLineClick && location.documentId);
        const lineMarks = marksByLine.get(lineNumber) ?? [];
        return (
          <div
            key={index}
            data-line={lineNumber}
            className={lineClassName(clickable, lineMarks, focusLine === lineNumber)}
            {...(lineMarks.length > 0 ? { title: lineMarks.map((mark) => mark.message).join('\n') } : {})}
            {...(clickable ? { onClick: () => onLineClick?.({ ...location, path, line: lineNumber }) } : {})}
          >
            <span className="falang-code-view__line-number">{lineNumber}</span>
            <span className="falang-code-view__line-content" dangerouslySetInnerHTML={{ __html: highlighted[index] }} />
          </div>
        );
      })}
    </CodeContainer>
  );
};

/**
 * Generated code, one block for a single file or tabbed by path for several (a workflow's activities module, an Arduino
 * sketch plus its driver sources). Clicking a line produced by a document reports its document/node through the
 * `doc-start`/`icon-start` markers the compilers write (`@falang/debug`'s `parseCompiledMarkers`); `marks` tint the
 * lines a compiler complained about. Shared by the workflow client's code viewer and the Arduino IDE's.
 */
export const GeneratedCodeView: React.FC<Props> = ({ files, language = 'typescript', onLineClick, marks = [], focus }) => {
  const [activePath, setActivePath] = useState<string | undefined>(focus?.path ?? files[0]?.path);

  useEffect(() => {
    if (focus) setActivePath(focus.path);
  }, [focus]);

  useEffect(() => {
    if (!activePath || !files.some((file) => file.path === activePath)) setActivePath(files[0]?.path);
  }, [files, activePath]);

  const renderFile = (file: IGeneratedCodeFile): React.ReactElement => (
    <CodeLines
      path={file.path}
      content={file.content}
      language={language}
      marks={marks.filter((mark) => mark.path === file.path)}
      focusLine={focus?.path === file.path ? focus.line : null}
      onLineClick={onLineClick}
    />
  );

  if (files.length === 0) return null;
  if (files.length === 1) return renderFile(files[0]);
  return (
    <Tabs
      activeKey={activePath}
      onChange={setActivePath}
      items={files.map((file) => {
        const fileMarks = marks.filter((mark) => mark.path === file.path);
        const hasErrors = fileMarks.some((mark) => mark.severity === 'error');
        return {
          key: file.path,
          label: hasErrors ? <span style={{ color: '#f38ba8' }}>● {file.path}</span> : file.path,
          children: renderFile(file),
        };
      })}
    />
  );
};
