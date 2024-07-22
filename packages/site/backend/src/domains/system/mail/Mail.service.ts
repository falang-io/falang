import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as nodemailer from 'nodemailer';
import * as http from 'http';
import * as querystring from 'querystring';

const httpsPost = ({ body, ...options }: any) => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: 'POST',
        ...options,
      },
      (res) => {
        const chunks: Uint8Array[] = [];
        res.on('data', (data) => chunks.push(data));
        res.on('end', () => {
          let resBody = Buffer.concat(chunks);
          switch (res.headers['content-type']) {
            case 'application/json':
              resBody = JSON.parse(resBody.toString());
              break;
          }
          resolve(resBody);
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
};

import config, { EnviromentEnum } from '../../../config';

interface SendMailParams {
  to: string;
  subject: string;
  body: string;
}

let testSentMails: SendMailParams[] = [];

@Injectable()
export class MailService {
  constructor(private logger: PinoLogger) {
    this.logger.setContext(MailService.name);
  }

  async send({ to, subject, body }: SendMailParams) {
    this.logger.debug(
      'Sending mail\nTo:%s\nSubject:%s\nBody:%o',
      to,
      subject,
      body,
    );
    if (config.NODE_ENV === EnviromentEnum.testing) {
      testSentMails.push({ to, subject, body });
    }
    if (config.NODE_ENV === EnviromentEnum.production) {
      await httpsPost({
        hostname: process.env.EMAIL_PROXY_HOST,
        path: process.env.EMAIL_PROXY_PATH,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: querystring.encode({
          to,
          subject,
          body,
        }),
      });
    }
  }

  getTestSentMails() {
    return testSentMails;
  }

  getLastSentTestMail(email: string): SendMailParams {
    const mail = testSentMails.filter((item) => item.to === email).reverse()[0];
    if (!mail) {
      throw new Error(`Mail for ${email} not found`);
    }
    return mail;
  }

  clearTestMails() {
    testSentMails = [];
  }
}
