import { Injectable } from '@nestjs/common';
import { SessionData, Store } from 'express-session';
import { SessionService } from './services/Session.service';

@Injectable()
export class SessionStore extends Store {
  constructor(private sessions: SessionService) {
    super();
  }

  get(
    sid: string,
    callback: (err: any, session?: SessionData | null) => void,
  ): void {
    this.sessions
      .get(sid)
      .then((session) => {
        if (!session) {
          return callback(null, null);
        }
        callback(null, session.getSessionData());
      })
      .catch((err) => {
        callback(err, null);
      });
  }

  set(
    sid: string,
    sessionData: SessionData,
    callback?: (err?: any) => void,
  ): void {
    this.sessions
      .set(sid, sessionData)
      .then(() => {
        callback && callback();
      })
      .catch((err) => {
        // console.log(err);
        callback && callback(err);
      });
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    this.sessions
      .stop(sid)
      .then(() => {
        callback && callback();
      })
      .catch((err) => {
        callback && callback(err);
      });
  }
}
