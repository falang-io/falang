import { describe, expect, it } from 'vitest';
import { emptyTableData } from '@falang/workflow-dto';
import {
  addField,
  moveField,
  optionsToText,
  removedFields,
  removeField,
  retypedFields,
  textToOptions,
  updateField,
  validateTableDraft,
} from './table-fields-model.js';

describe('table fields model', () => {
  it('adds fields with monotone ids and unique names', () => {
    let data = addField(emptyTableData());
    data = addField(data, 'select');
    expect(data.fields.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(data.nextFieldNo).toBe(3);
    expect(data.fields[1]?.options).toEqual(['option1']);
    data = removeField(data, 'f2');
    data = addField(data);
    expect(data.fields.map((f) => f.id)).toEqual(['f1', 'f3']);
  });

  it('seeds options when retyped to select and drops them when leaving it', () => {
    let data = addField(emptyTableData());
    data = updateField(data, 'f1', { type: 'select' });
    expect(data.fields[0]?.options).toEqual(['option1']);
    data = updateField(data, 'f1', { type: 'number' });
    expect(data.fields[0]?.options).toBeUndefined();
  });

  it('keeps defaults only on required fields and clears empty, disabled and retyped defaults', () => {
    let data = addField(emptyTableData(), 'boolean');
    data = updateField(data, 'f1', { defaultValue: false });
    expect(data.fields[0]?.defaultValue).toBeUndefined();
    data = updateField(data, 'f1', { required: true, defaultValue: false });
    expect(data.fields[0]?.defaultValue).toBe(false);
    data = updateField(data, 'f1', { defaultValue: null });
    expect(data.fields[0]?.defaultValue).toBeUndefined();
    data = updateField(data, 'f1', { type: 'number', defaultValue: 0 });
    expect(data.fields[0]?.defaultValue).toBe(0);
    data = updateField(data, 'f1', { required: false });
    expect(data.fields[0]?.defaultValue).toBeUndefined();
    data = updateField(data, 'f1', { required: true, defaultValue: 0 });
    data = updateField(data, 'f1', { type: 'text' });
    expect(data.fields[0]?.defaultValue).toBeUndefined();
  });

  it('reorders within bounds', () => {
    let data = addField(addField(emptyTableData()));
    expect(moveField(data, 'f1', -1)).toBe(data);
    data = moveField(data, 'f1', 1);
    expect(data.fields.map((f) => f.id)).toEqual(['f2', 'f1']);
  });

  it('lists retyped and removed fields against the saved definition', () => {
    const saved = addField(addField(emptyTableData()));
    let draft = updateField(saved, 'f1', { type: 'number' });
    draft = removeField(draft, 'f2');
    expect(retypedFields(saved, draft).map((f) => f.id)).toEqual(['f1']);
    expect(removedFields(saved, draft).map((f) => f.id)).toEqual(['f2']);
    expect(retypedFields(saved, saved)).toEqual([]);
  });

  it('round-trips select options text', () => {
    expect(textToOptions('a\n b \n\na')).toEqual(['a', 'b']);
    expect(optionsToText(['a', 'b'])).toBe('a\nb');
  });

  it('validates a draft with the shared normaliser', () => {
    const saved = addField(emptyTableData());
    expect(validateTableDraft(saved, saved).ok).toBe(true);
    const bad = updateField(saved, 'f1', { name: 'bad name' });
    const result = validateTableDraft(saved, bad);
    expect(result.ok).toBe(false);
    const two = addField(saved);
    const dup = updateField(two, 'f2', { name: two.fields[0]?.name.toUpperCase() ?? '' });
    expect(validateTableDraft(saved, dup).ok).toBe(false);
  });
});
