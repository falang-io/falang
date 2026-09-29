import { zod } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { buildActionDataSchema } from './build-node-config.js';
import { describeFieldForAgent } from './describe-field.js';
import type { IFieldConfig } from './types.js';

const chatIdField: IFieldConfig = {
  name: 'chatId',
  label: 'Chat ID',
  kind: 'expression',
  expectedType: { type: 'number', numberType: { type: 'any' } },
};
const textField: IFieldConfig = { name: 'text', label: 'Text', kind: 'template-string' };

describe('describeFieldForAgent', () => {
  it('tells an expression field is bare code, with its expected type', () => {
    const description = describeFieldForAgent(chatIdField);
    expect(description).toContain('never wrap a variable in `${…}`');
    expect(description).toContain('Must evaluate to type `number`.');
  });

  it('names a struct expected type by id', () => {
    const description = describeFieldForAgent({
      ...chatIdField,
      expectedType: { type: 'struct', id: 'telegram/Message' },
    });
    expect(description).toContain('the struct type "telegram/Message"');
  });

  it('tells a template-string field its backticks are added automatically', () => {
    expect(describeFieldForAgent(textField)).toContain('do NOT wrap the value in backticks or quotes');
  });

  it('lists static select options', () => {
    const description = describeFieldForAgent({
      name: 'mode',
      label: 'Mode',
      kind: 'select',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    expect(description).toContain('Allowed values: "a", "b".');
  });

  it('flags a files/File struct expected type as a reference, not a URL — never a URL string', () => {
    const description = describeFieldForAgent({
      ...chatIdField,
      expectedType: { type: 'struct', id: 'files/File' },
    });
    expect(description).toContain('the struct type "files/File"');
    expect(description).toContain('File reference (struct files/File)');
    expect(description).toContain('never a URL string');
  });

  it('flags an array of files/File the same way', () => {
    const description = describeFieldForAgent({
      ...chatIdField,
      expectedType: { type: 'array', elementType: { type: 'struct', id: 'files/File' }, dimensions: 1 },
    });
    expect(description).toContain('File reference (struct files/File)');
  });

  it('does not flag an unrelated struct type', () => {
    const description = describeFieldForAgent({
      ...chatIdField,
      expectedType: { type: 'struct', id: 'telegram/Message' },
    });
    expect(description).not.toContain('File reference');
  });
});

describe('buildActionDataSchema', () => {
  it("puts each field's description into the JSON Schema an agent sees", () => {
    const jsonSchema = zod.toJSONSchema(buildActionDataSchema([chatIdField, textField])) as {
      properties: Record<string, { type: string; description?: string }>;
    };
    expect(jsonSchema.properties['chatId']).toEqual({
      type: 'string',
      description: describeFieldForAgent(chatIdField),
    });
    expect(jsonSchema.properties['text']?.description).toBe(describeFieldForAgent(textField));
  });
});
