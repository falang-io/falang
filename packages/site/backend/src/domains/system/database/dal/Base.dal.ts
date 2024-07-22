/* eslint-disable @typescript-eslint/no-explicit-any */
import { EntityManager, ObjectType } from 'typeorm';

interface BaseDalParams<TEntity extends BaseEntity> {
  entity: ObjectType<TEntity>;
  em: EntityManager;
}

interface BaseEntity {
  id: any;
}

export class BaseDal<TEntity extends BaseEntity> {
  protected readonly entity: ObjectType<TEntity>;
  protected readonly em: EntityManager;

  constructor({ entity, em }: BaseDalParams<TEntity>) {
    this.entity = entity;
    this.em = em;
  }

  protected getRepository(em?: EntityManager) {
    return (em ?? this.em).getRepository(this.entity);
  }

  protected transaction<T>(
    em?: EntityManager,
    cb?: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!cb) throw new Error('Callback required');
    return em ? cb(em) : this.em.transaction((em) => cb(em));
  }

  async getById(id: any, em?: EntityManager): Promise<TEntity | null> {
    return (await this.getRepository(em).findOneBy({ id })) ?? null;
  }
}
