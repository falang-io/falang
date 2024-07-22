import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { databaseOptions } from './Database.options';
import { PinoTypeormLogger } from './PinoTypeormLogger';

export const getTypeormModule = (): DynamicModule => {
  return TypeOrmModule.forRootAsync({
    useFactory: (logger: PinoLogger): TypeOrmModuleOptions => {
      logger.setContext('DatabaseModule');
      return {
        logger: new PinoTypeormLogger(logger),
        // logging: true,
        ...databaseOptions,
      };
    },
    inject: [PinoLogger],
  });
};
