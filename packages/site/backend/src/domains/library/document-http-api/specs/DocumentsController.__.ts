import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import '../../../../config';
import {
  createDocumentForUser,
  createUserAndLogin,
  validateDto,
} from '../../../../../test/maker';
import { httpServerBootstrap } from '../../../../bootstrap/httpServer.bootstrap';
import { DocumentHttpApiModule } from '../DocumentHttpApi.module';
import { DocumentListDto } from '../../document/dto/Document.dto';
import { UserHttpApiModule } from '../../../user/http-api/UserHttpApi.module';
import { getTypeormModule } from '../../../system/database/getTypeormModule';
import { Document } from '../../document/entites/Document.entity';

const createApp = async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      getTypeormModule(),
      LoggerModule.forRoot({
        pinoHttp: {
          level: 'trace',
          customLogLevel: () => 'trace',
          transport: {
            target: 'pino-pretty',
          },
        },
      }),
      DocumentHttpApiModule,
      UserHttpApiModule,
    ],
  }).compile();
  const app = moduleFixture.createNestApplication({
    bufferLogs: true,
    autoFlushLogs: false,
  });
  await httpServerBootstrap(app);
  await app.init();
  return app;
};

describe('DocumentsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    app && (await app.close());
  });

  /*describe('Auth', () => {
    it('Should return forbidden when calling /documents without authorisation', async () => {
      const agent = supertest.agent(app.getHttpServer());
      await agent.get('/documents').send().expect(403);
    });

    it('Should return forbidden when calling /documents/:id without authorisation', async () => {
      const agent = supertest.agent(app.getHttpServer());
      await agent.get(`/documents/${uuidV4()}`).send().expect(403);
    });

    it('Should return forbidden when POST /documents without authorisation', async () => {
      const agent = supertest.agent(app.getHttpServer());
      await agent.post('/documents').send({}).expect(403);
    });

    it('Should return forbidden when PUT /documents without authorisation', async () => {
      const agent = supertest.agent(app.getHttpServer());
      await agent.put('/documents').send({}).expect(403);
    });
  });*/

  describe('List', () => {
    /*it('Should return empty list', async () => {
      const { agent } = await createUserAndLogin(app);
      await agent
        .get('/documents')
        .send()
        .expect(200)
        .then(({ body }) => {
          validateDto(DocumentListDto, body);
        });
    });

    it('Should return user`s document', async () => {
      const {
        agent,
        user: { id: userId },
      } = await createUserAndLogin(app);
      const { document } = await createDocumentForUser({ userId }, app);
      await agent
        .get('/documents')
        .send()
        .expect(200)
        .then(({ body }: { body: DocumentListDto }) => {
          console.log('-----');
          console.log(body);
          validateDto(DocumentListDto, body);
          expect(body.items.length).toEqual(1);
          const newDoc = body.items[0];
          expect(newDoc.id).toEqual(document.id);
          expect(newDoc.name).toEqual(document.name);
        });
    });*/

    it('Should paginate by documents', async () => {
      const {
        agent,
        user: { id: userId },
      } = await createUserAndLogin(app);
      const documents: Document[] = [];
      for (let i = 0; i < 30; i++) {
        const { document } = await createDocumentForUser({ userId }, app);
        documents.push(document);
      }
      await agent
        .get('/documents')
        .send({ limit: 5, offset: 0 })
        .expect(200)
        .then(({ body }: { body: DocumentListDto }) => {
          validateDto(DocumentListDto, body);
          expect(body.items.length).toEqual(5);
        });
    });
  });
});
