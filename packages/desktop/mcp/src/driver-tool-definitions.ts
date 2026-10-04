import { zod } from '@falang/dto';
import type { IMcpToolDefinition } from '@falang/mcp-core';
import { driverBundleZod } from '@falang/desktop-arduino-dto';
import { DEVICES_TOOLS } from './devices-tools.js';

/**
 * The Arduino-only driver tool definitions of ADR 0054 (private) §7 — registered by `server.ts` only for an
 * `'arduino'` project (they know `falang/drivers/`, the library and `arduino-cli`, none of which
 * `@falang/mcp-core`'s shared tools should). Handlers live in `driver-tools.ts`.
 */
const editScopeZod = zod.enum(['project', 'library']);
const anyScopeZod = zod.enum(['project', 'library', 'bundled']);

const VALIDATE_FIRST = `A driver is a bundle { formatVersion: 1, config, files }: config is driver.config.json (id, label, notes, includes, sourceFiles, declarations, actions, optional device) and files maps each listed file name to its text. Give every C function a prefix unique to this driver, declare each one in config.declarations, and make one action per user-visible operation (with a plain-English notes).`;

export const DRIVER_TOOLS: readonly IMcpToolDefinition[] = [
  {
    annotations: { readOnlyHint: true },
    description: `Read-only. Lists every Arduino device driver visible to this project — built-in, the personal library and the project's own falang/drivers — with id, label, scope, notes, each action (id, notes, field names and kinds, result type), the device section if it has one, and a status (ok / load-error with the reason). A driver in a higher scope shadows a same-id one below it (project > library > built-in).`,
    inputSchema: zod.object({}),
    name: 'list_drivers',
  },
  {
    annotations: { readOnlyHint: true },
    description:
      'Read-only. Returns one driver as a bundle ({ formatVersion, config, files }) — the format set_driver accepts. Without scope, the effective driver (the one a build would use).',
    inputSchema: zod.object({ id: zod.string(), scope: anyScopeZod.optional() }),
    name: 'get_driver',
  },
  {
    annotations: { readOnlyHint: true },
    description: `Read-only. Checks a driver bundle without writing anything: schema, name collisions with other drivers, template type-check, the project's existing usages (project scope) and an arduino-cli compile of a synthetic sketch for the project board (library scope uses the default board). Always run this before set_driver. ${VALIDATE_FIRST}`,
    inputSchema: zod.object({ bundle: driverBundleZod, scope: editScopeZod }),
    name: 'validate_driver',
  },
  {
    annotations: { destructiveHint: true },
    description: `Creates or replaces a driver (project: <project>/falang/drivers/<id>/, library: the user's personal library) after the full validate_driver pipeline — nothing is written unless it passes. New driver-action kinds are visible to get_node_kinds/set_document immediately. If the driver has a \`device\` section, call get_devices then set_devices to add an instance of it to the Devices document. Use the project scope unless the user wants it in their library. ${VALIDATE_FIRST}`,
    inputSchema: zod.object({ bundle: driverBundleZod, scope: editScopeZod }),
    name: 'set_driver',
  },
  {
    annotations: { destructiveHint: true },
    description:
      'Deletes a driver from the project or the library. A project driver that nodes or Devices entries still use is refused with the list of usages (unless a library/built-in driver of the same id would take over).',
    inputSchema: zod.object({ id: zod.string(), scope: editScopeZod }),
    name: 'delete_driver',
  },
  {
    annotations: { idempotentHint: true },
    description:
      "Copies a driver from the user's personal library into the project (validated like set_driver), replacing a project copy of the same id.",
    inputSchema: zod.object({ id: zod.string() }),
    name: 'use_library_driver',
  },
  ...DEVICES_TOOLS,
];
