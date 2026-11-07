/**
 * Workflow-side half of the `tables` record triggers (ADR 0075 (private), amendment A1). The change dispatcher
 * signals an id-keyed payload (`ITableTriggerWirePayload`); the compiled trigger preamble turns it into the
 * name-keyed event the user's code is typed against. The `{ [tableId]: { [fieldName]: fieldId } }` map is baked into
 * the workflows module (like `__falangTableFields` in the activities module), so a published trigger-function keeps
 * its names after the user renames a field. Pure, dependency-free, deterministic code only — it runs in the Temporal
 * workflow sandbox.
 */
export const TABLE_TRIGGER_WIRE_TYPE = '__FalangTableWire';
export const TABLE_TRIGGER_EVENT_FN = '__falangTableEvent';
export const TABLE_TRIGGER_FIELD_IDS_CONST = '__falangTableFieldIds';

export const buildTableTriggerRuntimeCode = (
  tableFields: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string =>
  [
    'type __FalangTableWireRecord = { id: string; version: number; createdAt: string; updatedAt: string; data: Record<string, unknown> };',
    `type ${TABLE_TRIGGER_WIRE_TYPE} = { table: string; record: __FalangTableWireRecord; previous?: __FalangTableWireRecord; changedFieldIds?: string[]; source: string };`,
    `const ${TABLE_TRIGGER_FIELD_IDS_CONST}: Record<string, Record<string, string>> = ${JSON.stringify(tableFields)};`,
    `function ${TABLE_TRIGGER_EVENT_FN}(wire: ${TABLE_TRIGGER_WIRE_TYPE}): any {`,
    '  // A hand-typed test payload ("Run function") is already name-keyed: its record has no `data` object.',
    "  if (!wire.record || typeof wire.record.data !== 'object' || wire.record.data === null) return wire;",
    `  const names = ${TABLE_TRIGGER_FIELD_IDS_CONST}[wire.table] ?? {};`,
    '  const nameById: Record<string, string> = {};',
    '  for (const name of Object.keys(names)) nameById[names[name]] = name;',
    '  const toRow = (record: __FalangTableWireRecord): Record<string, unknown> => {',
    '    const row: Record<string, unknown> = { id: record.id, version: record.version, createdAt: record.createdAt, updatedAt: record.updatedAt };',
    '    for (const fieldId of Object.keys(record.data)) {',
    '      const name = nameById[fieldId];',
    "      if (typeof name === 'string') row[name] = record.data[fieldId];",
    '    }',
    '    return row;',
    '  };',
    '  const event: Record<string, unknown> = { table: wire.table, record: toRow(wire.record), source: wire.source };',
    '  if (wire.previous) event.previous = toRow(wire.previous);',
    '  if (wire.changedFieldIds) {',
    "    event.changedFields = wire.changedFieldIds.map((fieldId) => nameById[fieldId]).filter((name) => typeof name === 'string');",
    '  }',
    '  return event;',
    '}',
  ].join('\n');
