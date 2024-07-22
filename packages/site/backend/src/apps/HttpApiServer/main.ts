import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { httpServerBootstrap } from '../../bootstrap/httpServer.bootstrap';
import { HttpApiServerModule } from './HttpApiServer.module';

const bootstrap = async () => {
  const app = await NestFactory.create(HttpApiServerModule, {
    cors: {
      origin: true,
      credentials: true,
    },
  });
  await httpServerBootstrap(app);
  await app.listen('8080');
  const logger = await app.resolve(Logger);
  logger.log('HttpApiServer started.');
};

bootstrap();
