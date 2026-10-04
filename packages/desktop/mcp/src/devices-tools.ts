import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { zod } from '@falang/dto';
import { acquireLock, type IMcpToolDefinition } from '@falang/mcp-core';
import { listTree, readDocument, readLocks, writeDocument, writeLocks } from '@falang/desktop-project-fs';
import {
  DEVICE_PIN_MODES,
  DEVICES_DOCUMENT_TYPE,
  formatDevicesIssues,
  parseDevicesDocumentData,
  prepareDevicesData,
} from '@falang/desktop-arduino-dto';
import type { IDriverToolContext } from './driver-tools.js';
import { MCP_LOCK_OWNER } from './owner.js';
import { errorResult, jsonResult, messageOf } from './tool-results.js';

/**
 * `get_devices`/`set_devices` — the Arduino `Devices` document (pins + driver device instances), which is a `data`
 * document without a node tree and so cannot go through `set_document`. Registered next to the driver tools (same
 * Arduino-only gating); validation is `prepareDevicesData`, shared with the in-app agent; the write takes the document
 * lock like `set_document` (owner `mcp`, refused while another owner holds it).
 */
export const DEVICES_TOOLS: readonly IMcpToolDefinition[] = [
  {
    annotations: { readOnlyHint: true },
    description:
      "Read-only. Returns the project's Devices document { pins, devices }: digital pins configured with pinMode(...) at the start of setup(), and instances of drivers that have a `device` section (see list_drivers) with their connection params. Call it before set_devices — set_devices replaces everything.",
    inputSchema: zod.object({}),
    name: 'get_devices',
  },
  {
    annotations: { destructiveHint: true },
    description:
      'Replaces the whole Devices document (start from get_devices and keep what the user already has). pins: [{ pin, mode: input|output|input-pullup, label? }], one row per pin number. devices: [{ driverId, name, params }] where driverId is a driver with a `device` section and params maps each of its device fields to a string value (absent params take the field default). Row ids are generated when omitted. Takes the document lock like set_document and writes nothing if any row is invalid (the errors name the path). Use it after set_driver to add an instance of a new driver; its setup template is then compiled into setup().',
    inputSchema: zod.object({
      devices: zod.array(
        zod.object({
          driverId: zod.string(),
          id: zod.string().optional(),
          name: zod.string(),
          params: zod.record(zod.string(), zod.string()).optional(),
        }),
      ),
      pins: zod.array(
        zod.object({
          id: zod.string().optional(),
          label: zod.string().optional(),
          mode: zod.enum(DEVICE_PIN_MODES),
          pin: zod.number().int().min(0),
        }),
      ),
    }),
    name: 'set_devices',
  },
];

const findDevicesDocumentId = async (projectDir: string): Promise<string | null> => {
  const tree = await listTree(projectDir);
  return tree.documents.find((doc) => doc.type === DEVICES_DOCUMENT_TYPE)?.id ?? null;
};

export const handleGetDevices = async (ctx: IDriverToolContext): Promise<CallToolResult> => {
  try {
    const id = await findDevicesDocumentId(ctx.projectDir);
    if (!id) return errorResult('get_devices: this project has no Devices document');
    const document = await readDocument(ctx.projectDir, id);
    return jsonResult({ documentId: id, ...parseDevicesDocumentData(document.data) });
  } catch (error) {
    return errorResult(`get_devices: ${messageOf(error)}`);
  }
};

export const handleSetDevices = async (ctx: IDriverToolContext, args: unknown): Promise<CallToolResult> => {
  try {
    const id = await findDevicesDocumentId(ctx.projectDir);
    if (!id) return errorResult('set_devices: this project has no Devices document');
    const prepared = prepareDevicesData(
      args,
      ctx.state.drivers.map((driver) => driver.config),
    );
    if (!prepared.ok) {
      return errorResult(`set_devices: nothing was written.\n${formatDevicesIssues(prepared.errors)}`);
    }
    const lock = acquireLock(await readLocks(ctx.projectDir), {
      documentId: id,
      now: Date.now(),
      owner: MCP_LOCK_OWNER,
    });
    if (!lock.ok) return errorResult(`set_devices: ${lock.error}`);
    const old = await readDocument(ctx.projectDir, id);
    await writeDocument(ctx.projectDir, { ...old, data: prepared.data });
    await writeLocks(ctx.projectDir, lock.locks);
    return jsonResult({ documentId: id, written: true, ...prepared.data });
  } catch (error) {
    return errorResult(`set_devices: ${messageOf(error)}`);
  }
};
