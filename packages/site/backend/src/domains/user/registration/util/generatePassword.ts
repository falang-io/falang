import { generateRandomString } from '../../../system/util/generateRandomString';
import { hashPassword } from './hashPassword';

export interface PasswordGenerationResult {
  password: string;
  hash: string;
  salt: string;
}

export const generateSalt = (): string => {
  return generateRandomString(10);
};

export const generatePassword = (): PasswordGenerationResult => {
  const password = generateRandomString(10);
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  console.log({ password, salt, hash });
  return { password, salt, hash };
};
