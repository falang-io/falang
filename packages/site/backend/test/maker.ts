import { INestApplication } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as supertest from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { v4 as uuidV4 } from 'uuid';

import { DocumentDal } from '../src/domains/library/document/dal/Document.dal';
import { DocumentDto } from '../src/domains/library/document/dto/Document.dto';
import { IDocumentWithVersion } from '../src/domains/library/document/interfaces/IDocumentWithVersion';
import { generatePassword } from '../src/domains/user/registration/util/generatePassword';
import { UserDal } from '../src/domains/user/user/dal/User.dal';
import { User } from '../src/domains/user/user/entites/User.entity';

export const randomEmail = (): string => `user${Date.now()}@mail.ru`;
export const randomUsername = (): string => `user${Date.now()}`;

interface CreateUserAndLoginResult {
  agent: TestAgent;
  user: User;
}

export const createUserAndLogin = async (
  app: INestApplication,
): Promise<CreateUserAndLoginResult> => {
  const agent = supertest.agent(app.getHttpServer());
  const email = randomEmail();
  const username = randomUsername();
  const userDal = await app.resolve(UserDal);
  const generatedPassword = generatePassword();
  const user = await userDal.create({
    email,
    username,
    passwordHash: generatedPassword.hash,
    passwordSalt: generatedPassword.salt,
  });
  await agent
    .post('/user/session/login')
    .send({ username: username, password: generatedPassword.password })
    .expect(201);
  return { agent, user };
};

export const validateDto = (
  c: ClassConstructor<object>,
  data: object,
): void => {
  const validateResult = validateSync(plainToInstance(c, data));
  expect(validateResult).toEqual([]);
};

interface CreateDocumentForUserParams {
  userId: number;
}

export const VALID_TEMPLATE = 'default';

export const createDocumentForUser = async (
  { userId }: CreateDocumentForUserParams,
  app: INestApplication,
): Promise<IDocumentWithVersion> => {
  const dal = app.get(DocumentDal);
  const dto = new DocumentDto();

  dto.id = uuidV4();
  dto.name = `document${Date.now()}`;
  dto.root = {};
  //dto.template = VALID_TEMPLATE;
  dto.latestVersionHash = `description${Date.now()}`;
  return await dal.create(dto, userId);
};
