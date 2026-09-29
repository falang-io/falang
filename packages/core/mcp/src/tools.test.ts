import { describe, expect, it } from 'vitest';
import { getMcpToolJsonSchema, MCP_TOOL_JSON_SCHEMAS, MCP_TOOLS } from './tools.js';

const EXPECTED_TOOL_NAMES = [
  'get_project',
  'list_documents',
  'get_document',
  'get_node_kinds',
  'create_document',
  'set_document',
  'rename_document',
  'move_document',
  'delete_document',
  'create_folder',
  'lock_document',
  'unlock_document',
];

describe('MCP_TOOLS', () => {
  it("matches the ADR's v1 shared tool list exactly", () => {
    expect(MCP_TOOLS.map((tool) => tool.name).toSorted()).toEqual(EXPECTED_TOOL_NAMES.toSorted());
  });

  it('every tool has a non-empty description', () => {
    for (const tool of MCP_TOOLS) expect(tool.description.length).toBeGreaterThan(10);
  });

  it('delete_document carries destructiveHint, read-only tools carry readOnlyHint', () => {
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get('delete_document')?.annotations?.destructiveHint).toBe(true);
    expect(byName.get('get_project')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('list_documents')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('get_document')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('get_node_kinds')?.annotations?.readOnlyHint).toBe(true);
  });

  it('getMcpToolJsonSchema produces a JSON Schema object for every tool', () => {
    for (const tool of MCP_TOOLS) {
      const schema = getMcpToolJsonSchema(tool);
      expect(schema.type).toBe('object');
    }
  });

  it('MCP_TOOL_JSON_SCHEMAS is precomputed for every tool by name', () => {
    expect(Object.keys(MCP_TOOL_JSON_SCHEMAS).toSorted()).toEqual(EXPECTED_TOOL_NAMES.toSorted());
  });

  it('set_document requires documentId and root', () => {
    const schema = MCP_TOOL_JSON_SCHEMAS.set_document as { required?: string[] };
    expect(schema.required?.toSorted()).toEqual(['documentId', 'root']);
  });
});
