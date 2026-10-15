// @vitest-environment jsdom
import { createHeadlessEditor } from '@lexical/headless';
import { $getRoot, $isParagraphNode, type LexicalEditor } from 'lexical';
import { describe, expect, it } from 'vitest';
import { htmlToNodes, nodesToHtml } from './html-io.js';
import { $createImageNode, $isImageNode, ImageNode } from './image-node.js';

const createEditor = () =>
  createHeadlessEditor({
    namespace: 'image-node-test',
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
  });

const images = (editor: LexicalEditor): ImageNode[] =>
  editor.getEditorState().read(() => {
    const found: ImageNode[] = [];
    const walk = (nodes: ReturnType<typeof $getRoot>['getChildren'] extends () => infer R ? R : never) => {
      for (const node of nodes) {
        if ($isImageNode(node)) found.push(node);
        else if ('getChildren' in node) walk((node as unknown as { getChildren(): typeof nodes }).getChildren());
      }
    };
    walk($getRoot().getChildren());
    return found;
  });

describe('ImageNode', () => {
  it('imports <img> with numeric width/height and keeps src and alt', () => {
    const editor = createEditor();
    htmlToNodes(editor, '<p><img src="https://x.test/a.png" alt="cat" width="120" height="80"></p>');
    const [node] = images(editor);
    expect(node.getSrc()).toBe('https://x.test/a.png');
    expect(node.getAltText()).toBe('cat');
    expect(node.__width).toBe(120);
    expect(node.__height).toBe(80);
  });

  it('treats a non-numeric or missing width/height as "inherit"', () => {
    const editor = createEditor();
    htmlToNodes(editor, '<p><img src="https://x.test/a.png" width="abc"></p>');
    const [node] = images(editor);
    expect(node.__width).toBe('inherit');
    expect(node.__height).toBe('inherit');
  });

  const convert = (build: () => HTMLImageElement) => {
    const editor = createEditor();
    let result: unknown = 'unset';
    editor.update(
      () => {
        const conversion = ImageNode.importDOM()?.img?.(document.createElement('img'));
        result = conversion?.conversion(build());
      },
      { discrete: true },
    );
    return result as { node: ImageNode } | null;
  };

  it('does not convert local file:/// images', () => {
    expect(
      convert(() => {
        const img = document.createElement('img');
        img.src = 'file:///tmp/a.png';
        return img;
      }),
    ).toBeNull();
  });

  it('does not convert a Google Docs checkbox image at the start of a list item', () => {
    const result = convert(() => {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = 'https://x.test/c.png';
      img.setAttribute('aria-roledescription', 'checkbox');
      li.append(img);
      return img;
    });
    expect(result).toBeNull();
  });

  it('converts an ordinary image, and a checkbox-like image that is not first in its item', () => {
    const result = convert(() => {
      const li = document.createElement('li');
      li.append('text');
      const img = document.createElement('img');
      img.src = 'https://x.test/c.png';
      img.setAttribute('aria-roledescription', 'checkbox');
      li.append(img);
      return img;
    });
    expect(result?.node.getSrc()).toBe('https://x.test/c.png');
  });

  it('exports <img> with only the attributes that are set', () => {
    const editor = createEditor();
    htmlToNodes(editor, '<p><img src="https://x.test/a.png" width="10"></p>');
    const html = nodesToHtml(editor);
    expect(html).toContain('src="https://x.test/a.png"');
    expect(html).toContain('width="10"');
    expect(html).not.toContain('height=');
    expect(html).not.toContain('alt=');
  });

  it('serializes to JSON and back, keeping numeric sizes and omitting inherited ones', () => {
    const editor = createEditor();
    editor.update(
      () => {
        const sized = $createImageNode({ src: 's1', altText: 'a', width: 50, height: 40, maxWidth: 300 });
        $getRoot().append(sized);
      },
      { discrete: true },
    );
    const state = JSON.stringify(editor.getEditorState().toJSON());
    expect(state).toContain('"src":"s1"');
    expect(state).toContain('"width":50');

    const restored = createEditor();
    restored.setEditorState(restored.parseEditorState(state));
    const [node] = images(restored);
    expect(node.getSrc()).toBe('s1');
    expect(node.__width).toBe(50);
    expect(node.__height).toBe(40);
    expect(node.__maxWidth).toBe(300);
  });

  it('setWidthAndHeight updates the node, clone keeps its fields, and it is an inline node with an empty updateDOM', () => {
    const editor = createEditor();
    editor.update(
      () => {
        const node = $createImageNode({ src: 's', altText: 'alt' });
        $getRoot().append(node);
        node.setWidthAndHeight(11, 22);
        const live = node.getLatest();
        expect(live.__width).toBe(11);
        expect(live.__height).toBe(22);
        const copy = ImageNode.clone(live);
        expect(copy.__src).toBe('s');
        expect(copy.__width).toBe(11);
        expect(live.isInline()).toBe(true);
        expect(live.updateDOM()).toBe(false);
        expect(ImageNode.getType()).toBe('image');
        expect($isParagraphNode(node)).toBe(false);
      },
      { discrete: true },
    );
  });
});
