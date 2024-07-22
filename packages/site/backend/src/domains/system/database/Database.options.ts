import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import config from './Database.config';

export const datasourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: config.DB_HOST,
  port: config.DB_PORT,
  username: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_DATABASE,
};

export const databaseOptions: TypeOrmModuleOptions = {
  ...datasourceOptions,
  autoLoadEntities: true,
};
