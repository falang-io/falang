import 'reflect-metadata';
import type { DependencyContainer } from 'tsyringe';
export * from 'tsyringe';

export type TSchemeToken<T> = symbol & { type?: T };

export const createSchemeToken = <T>(name: string): TSchemeToken<T> => Symbol(name) as symbol & { type?: T };

export const resolveService = <T>(token: TSchemeToken<T>, container: DependencyContainer): T =>
  container.resolve(token);
