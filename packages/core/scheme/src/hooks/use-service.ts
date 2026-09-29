import type { TSchemeToken } from '@falang/di';
import { resolveService } from '@falang/di';
import { useContainer } from './container.context';

export const useService = <T>(token: TSchemeToken<T>): T => {
  const container = useContainer();
  if (!container) throw new Error('No container found');
  return resolveService(token, container);
};
