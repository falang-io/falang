import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import passport from 'passport';
import session from 'express-session';

import SessionConfig from '../domains/user/session/Session.config';
import { SessionStore } from '../domains/user/session/Session.store';

export const httpServerBootstrap = async (app: INestApplication) => {
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalPipes(new ValidationPipe());
  const store = await app.resolve(SessionStore);
  app.use(
    session({
      store,
      secret: SessionConfig.SESSION_SECRET,
      resave: true,
      saveUninitialized: false,
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
};
