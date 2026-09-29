// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createHeadlessEditor } from '@lexical/headless';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import type { IconStore } from '@falang/scheme';
import { container } from '@falang/di';
import { ImageNode } from './lexical/image-node.js';
import { htmlToNodes, nodesToHtml } from './lexical/html-io.js';
import { HtmlBlockEditorStore } from './html-block-editor.store.js';

const createTestEditor = () =>
  createHeadlessEditor({
    namespace: 'html-round-trip-test',
    nodes: [ImageNode, HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
    onError: (error) => {
      throw error;
    },
  });

describe('html round-trip (lexical)', () => {
  it('imports legacy plain text without throwing and exports it as a paragraph', () => {
    const editor = createTestEditor();
    expect(() => htmlToNodes(editor, 'hello')).not.toThrow();
    const html = nodesToHtml(editor);
    expect(html).toContain('<p');
    expect(html).toContain('hello');
  });

  it('imports legacy `<div>a<br>b</div>` without throwing and keeps the text', () => {
    const editor = createTestEditor();
    expect(() => htmlToNodes(editor, '<div>a<br>b</div>')).not.toThrow();
    const html = nodesToHtml(editor);
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('imports legacy `<b>x</b>` without throwing and keeps the bold text', () => {
    const editor = createTestEditor();
    expect(() => htmlToNodes(editor, '<b>x</b>')).not.toThrow();
    const html = nodesToHtml(editor);
    expect(html).toContain('x');
    expect(html.toLowerCase()).toMatch(/<strong|<b[ >]/);
  });

  it('round-trips a centered, sized image', () => {
    const editor = createTestEditor();
    const source =
      '<p style="text-align: center;"><img src="data:image/png;base64,iVBORw0KGgo=" width="120" height="80"></p>';
    htmlToNodes(editor, source);
    const html = nodesToHtml(editor);
    expect(html).toContain('text-align: center');
    expect(html).toContain('width="120"');
    expect(html).toContain('height="80"');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('HtmlBlockEditorStore.getData() returns initialData when no lexical editor was attached', () => {
    const store = new HtmlBlockEditorStore({
      container: container.createChildContainer(),
      data: '<p>unattached</p>',
      icon: null as unknown as IconStore,
    });
    expect(store.getData()).toBe('<p>unattached</p>');
  });
});
