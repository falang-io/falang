import { LoggerModule } from 'nestjs-pino';

export const getLoggerModule = () =>
  LoggerModule.forRoot({
    pinoHttp: {
      level: 'trace',
      customLogLevel: () => 'trace',
      transport: {
        target: 'pino-pretty',
      },
    },
  });
