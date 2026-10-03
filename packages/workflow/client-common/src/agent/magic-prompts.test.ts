import { describe, expect, it } from 'vitest';
import { buildMagicGeneratePrompt, buildMagicUpdatePrompt } from './magic-prompts.js';

describe('magic prompts', () => {
  it('generate: names the node/document, the spell, fill once and no documents', () => {
    const prompt = buildMagicGeneratePrompt({ documentId: 'doc-1', nodeId: 'n-1', spell: 'mark the order done' });
    expect(prompt.systemPrompt).toContain('"n-1"');
    expect(prompt.systemPrompt).toContain('"doc-1"');
    expect(prompt.systemPrompt).toContain('GENERATE');
    expect(prompt.systemPrompt).toContain('fill_magic_node');
    expect(prompt.systemPrompt).toContain('exactly ONCE');
    expect(prompt.systemPrompt).toContain('Never create documents');
    expect(prompt.request).toContain('mark the order done');
  });

  it('update: carries old and new text and starts from the current children', () => {
    const prompt = buildMagicUpdatePrompt({
      documentId: 'doc-1',
      nodeId: 'n-1',
      previousSpell: 'send an email',
      spell: 'send a telegram message',
    });
    expect(prompt.systemPrompt).toContain('UPDATE');
    expect(prompt.systemPrompt).toContain('hand');
    expect(prompt.systemPrompt).toContain('get_tree');
    expect(prompt.request).toContain('Old text: send an email');
    expect(prompt.request).toContain('New text: send a telegram message');
  });
});
