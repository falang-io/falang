import type { LexicalEditor, LexicalNode } from 'lexical';
import { $createParagraphNode, $getRoot, $isDecoratorNode, $isElementNode, CLEAR_HISTORY_COMMAND } from 'lexical';
import { sanitizeHtml } from '../../../utils/sanitize-html.js';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';

/**
 * Whether `node` can sit directly under root/shadow-root. Root only accepts block-level content —
 * `ElementNode`s that aren't inline (paragraph, heading, list, …) and non-inline `DecoratorNode`s.
 * Everything else (a bare `TextNode`, a `LineBreakNode`, an inline `ElementNode` like `LinkNode`, or
 * our own inline `ImageNode`) needs wrapping in a paragraph first.
 */
const canBeRootChild = (node: LexicalNode): boolean =>
  ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();

/**
 * Parses `html` and replaces the editor's whole document with the result.
 *
 * `@lexical/html`'s `$generateNodesFromDOM` only wraps loose inline runs in a paragraph when
 * they're a DOM element's *children* — nodes it produces directly from `<body>`'s own top-level
 * children (a bare "hello" text node, a lone `<b>x</b>`, …) come back unwrapped, and Lexical throws
 * if a `TextNode`/inline node is appended straight to root. This is exactly the shape legacy
 * documents (authored by the old plain-`contentEditable` block) can contain, so every top-level
 * node coming out of the parse is re-checked here and wrapped as needed before it reaches root.
 */
export const htmlToNodes = (editor: LexicalEditor, html: string): void => {
  // Defensive: some node kinds in this codebase share this block's editor wiring with a DTO node
  // that has no real `data` field of its own (`dataNode.data` comes back `null`/`undefined` there,
  // a pre-existing mismatch outside this package) — `DOMParser.parseFromString` stringifies a
  // non-string argument (`null` -> the literal 4-character text "null"), so guard here rather than
  // ever hand it anything but a real string.
  const safeHtml = typeof html === 'string' ? sanitizeHtml(html) : '';
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const parser = new DOMParser();
      const dom = parser.parseFromString(safeHtml, 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);

      let pendingInline: LexicalNode[] = [];
      const flushPendingInline = () => {
        if (pendingInline.length === 0) return;
        const paragraph = $createParagraphNode();
        paragraph.append(...pendingInline);
        root.append(paragraph);
        pendingInline = [];
      };

      for (const node of nodes) {
        if (canBeRootChild(node)) {
          flushPendingInline();
          root.append(node);
        } else {
          pendingInline.push(node);
        }
      }
      flushPendingInline();

      if (root.getChildrenSize() === 0) {
        root.append($createParagraphNode());
      }
    },
    { discrete: true },
  );
  // `dispatchCommand`'s payload parameter is required even for a `LexicalCommand<void>`.
  // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined
  editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
};

/** Reads the editor's current state and serializes it back to an HTML string. */
export const nodesToHtml = (editor: LexicalEditor): string => {
  let html = '';
  editor.getEditorState().read(() => {
    html = $generateHtmlFromNodes(editor);
  });
  return html;
};
