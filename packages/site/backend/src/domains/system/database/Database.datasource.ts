import { DataSource } from 'typeorm';
import { datasourceOptions } from './Database.options';
const dataSource = new DataSource({
  ...datasourceOptions,
  logging: false,
  logger: undefined,
  entities: ['src/domains/**/*.entity.ts'],
  migrations: ['src/domains/system/database/migrations/*.ts'],
});
export default dataSource;
