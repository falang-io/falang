import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createProject } from '@falang/desktop-project-fs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Creates a fresh temp project, runs `fn` against its directory, then removes it — same pattern `@falang/desktop-project-fs`'s own tests use. Not itself a test file (no `.test.ts` suffix), so vitest never collects it directly. */
export const withTempProject = async (
  params: { readonly name: string; readonly type: string },
  fn: (projectDir: string) => Promise<void>,
): Promise<void> => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-mcp-test-'));
  try {
    await createProject(projectDir, params);
    await fn(projectDir);
  } finally {
    await fs.rm(projectDir, { recursive: true, force: true });
  }
};

/** Every handler returns one JSON text content block on success — parse it back for assertions. */
export const resultJson = (result: CallToolResult): unknown => {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('expected a text content block');
  return JSON.parse(block.text);
};
