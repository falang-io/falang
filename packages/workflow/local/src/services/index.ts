import { activepiecesService } from './activepieces.js';
import { egressProxyService } from './egress-proxy.js';
import { mailpitService } from './mailpit.js';
import { mediaService } from './media.js';
import { mysqlUserDbService } from './mysql-user-db.js';
import { postgresUserDbService } from './postgres-user-db.js';
import type { ILocalService, TLocalServiceName } from './types.js';

/**
 * The optional local services by name (`--with <list>`, `startLocalMode({ services })`). Adding one: write
 * `./<name>.ts` exporting an `ILocalService`, import it here and replace its `null` below. `null` = not implemented
 * yet (asking for it is an error).
 */
export const LOCAL_SERVICES: Readonly<Record<TLocalServiceName, ILocalService | null>> = {
  mailpit: mailpitService,
  'egress-proxy': egressProxyService,
  media: mediaService,
  'postgres-user-db': postgresUserDbService,
  'mysql-user-db': mysqlUserDbService,
  activepieces: activepiecesService,
};

export type TLocalServiceRegistry = Readonly<Partial<Record<string, ILocalService | null>>>;

/** The service registered under `name`; throws for an unknown or not yet implemented one. */
export const getLocalService = (name: string, registry: TLocalServiceRegistry = LOCAL_SERVICES): ILocalService => {
  if (!Object.hasOwn(registry, name)) {
    throw new Error(`Unknown local service "${name}" (known: ${Object.keys(registry).join(', ')})`);
  }
  const service = registry[name];
  if (!service) throw new Error(`Local service "${name}" is not implemented yet`);
  return service;
};

export * from './types.js';
export * from './supervisor.js';
export * from './start-services.js';
