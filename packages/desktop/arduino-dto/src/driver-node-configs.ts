import { zod, type IDataInfo, type INodeConfig } from '@falang/dto';
import type { IDriverConfig } from './driver-config.js';
import { buildDriverActionNodeName } from './driver-node-name.js';

/** Every driver-action node's `data` is a flat `Record<string, string>` — one entry per `IDriverFieldDescriptor`, string-encoded regardless of the field's own `kind` (mirrors `@falang/workflow-scheme`'s `TIntegrationActionData`, see `driver-config.ts`'s doc comment for why this shape was chosen over the ADR's originally-stated nested `{ driverId, actionId, fields }`). */
const driverActionDataZod = zod.record(zod.string(), zod.string());

/** One `INodeConfig` per (driver, action) pair — see `driver-node-name.ts` for why this replaced a single generic `driver-action` node name. */
export const buildDriverNodeConfigs = (drivers: readonly IDriverConfig[]): readonly INodeConfig[] =>
  drivers.flatMap((driver) =>
    driver.actions.map((action): INodeConfig => {
      const dataType: IDataInfo<typeof driverActionDataZod> = {
        type: driverActionDataZod,
        default: () => Object.fromEntries(action.fields.map((field) => [field.name, field.default ?? ''])),
      };
      return { name: buildDriverActionNodeName(driver.id, action.id), data: dataType };
    }),
  );
