import { describe, expect, it } from 'vitest';
import { action, functionCfg, NodesGroup, NodesStack, zod, type IDataInfo, type INode } from '@falang/dto';
import { prepareDocumentWrite } from './prepare-document-write.js';
import { normalizeTemplateBody, templateFieldsOfKind } from './template-fields.js';
import { buildNodesReference } from './nodes-reference.js';

const stringType = { default: () => '', type: zod.string() } as const satisfies IDataInfo;

/** A vendor-style action (an object with one template field) and a `log`-style one (the whole data is a template). */
const stack = new NodesStack([
  new NodesGroup([
    action('say', {
      default: () => ({ chatId: '', text: '' }),
      type: zod.object({
        chatId: zod.string().describe('A TypeScript expression.'),
        text: zod.string().describe('Text compiled as the body of a JavaScript template literal: …'),
      }),
    }),
    action('log', {
      default: () => '',
      type: zod.string().describe('Log message text, compiled as the body of a template literal: …'),
    }),
    action('action', stringType),
    ...functionCfg({ data: stringType, footer: stringType, header: stringType, name: 'function' }),
  ]),
]);

const doc = (body: INode[]): INode => ({
  children: [
    { data: '', id: 'h', name: 'function-header' },
    { children: body, data: '', id: 'b', name: 'function-body' },
    { data: '', id: 'f', name: 'function-footer' },
  ],
  id: 'root',
  name: 'function',
});

const write = (body: unknown[]) => {
  const result = prepareDocumentWrite({
    documentId: 'd1',
    documentName: 'main',
    documentType: 'function',
    oldRoot: doc([]),
    stack,
    text: JSON.stringify(doc(body as INode[])),
  });
  if (!result.ok) throw new Error(result.error);
  return result.root.children?.[1].children ?? [];
};

describe('template fields (ADR 0062 §3)', () => {
  it('finds template properties of an object data and a whole-string template data', () => {
    expect(templateFieldsOfKind('say', stack)).toEqual({ properties: ['text'], whole: false });
    expect(templateFieldsOfKind('log', stack)).toEqual({ properties: [], whole: true });
    expect(templateFieldsOfKind('action', stack)).toEqual({ properties: [], whole: false });
  });

  it('turns a literal \n in the text into a line break, leaving ${…} code untouched', () => {
    const BS = '\\';
    expect(normalizeTemplateBody(`Hello,${BS}nworld`)).toBe('Hello,\nworld');
    expect(normalizeTemplateBody(`a${BS}r${BS}nb`)).toBe('a\nb');
    const code = `\${items.join('${BS}n')}`;
    expect(normalizeTemplateBody(`List:${BS}n${code}`)).toBe(`List:\n${code}`);
    const tricky = `\${a ? "}${BS}n" : b}`;
    expect(normalizeTemplateBody(`${tricky}${BS}nend`)).toBe(`${tricky}\nend`);
    expect(normalizeTemplateBody('`Hi ${name}`')).toBe('Hi ${name}');
    expect(normalizeTemplateBody('already\nfine')).toBe('already\nfine');
  });

  it('normalises template fields on write — vendor properties and log messages, never other fields', () => {
    const BS = '\\';
    const code = `\${x.join('${BS}n')}`;
    const [say, log, plain] = write([
      { data: { chatId: `"a${BS}nb"`, text: `Line 1${BS}nLine 2 ${code}` }, name: 'say' },
      { data: `count${BS}n= \${count}`, name: 'log' },
      { data: `s = "a${BS}nb"`, name: 'action' },
    ]);
    expect(say.data).toEqual({ chatId: `"a${BS}nb"`, text: `Line 1\nLine 2 ${code}` });
    expect(log.data).toBe('count\n= ${count}');
    expect(plain.data).toBe(`s = "a${BS}nb"`);
  });

  it("runs the host's normalize hook on every written node, after `in` and before validation", () => {
    const seen: string[] = [];
    const result = prepareDocumentWrite({
      dataMapping: {
        in: (kind, data) => (kind === 'action' ? `${String(data)};` : data),
        normalize: (node) => {
          seen.push(String(node.name));
          if (node.name === 'action') node.data = `${String(node.data)} // ok`;
        },
        out: (_kind, data) => data,
      },
      documentId: 'd1',
      documentName: 'main',
      documentType: 'function',
      oldRoot: doc([]),
      stack,
      text: JSON.stringify(doc([{ data: 'a = 1', id: 'n', name: 'action' }])),
    });
    expect(result.ok && result.root.children?.[1].children?.[0].data).toBe('a = 1; // ok');
    expect(seen).toEqual(['function', 'function-header', 'function-body', 'action', 'function-footer']);
  });

  it('marks a whole-string template kind in NODES.md', () => {
    const reference = buildNodesReference({
      documentTypes: [{ filePattern: 'functions/<name>.json', rootKind: 'function', type: 'function' }],
      stack,
    });
    expect(reference).toMatch(/log[^\n]*data: string \(template\)/);
  });
});
