import {
  IsEnum,
  IsString,
  IsNotEmpty,
  validateSync,
  IsBoolean,
} from 'class-validator';
import * as dotenv from 'dotenv';
import * as path from 'path';

const ENV_FILENAME = process.env.ENV_FILENAME || '.env';

dotenv.config({
  path: path.resolve(process.cwd(), ENV_FILENAME),
});

export enum EnviromentEnum {
  development = 'development',
  production = 'production',
  testing = 'test',
}

class Config {
  @IsNotEmpty()
  @IsEnum(EnviromentEnum)
  readonly NODE_ENV: EnviromentEnum = process.env.NODE_ENV as EnviromentEnum;

  @IsString()
  @IsNotEmpty()
  readonly PUBLIC_HOST = process.env.PUBLIC_HOST || '';

  @IsBoolean()
  readonly validateResponses = true;

  @IsString()
  readonly MAIL_HOST = process.env.MAIL_HOST || '';
  readonly MAIL_PORT = parseInt(process.env.MAIL_PORT || '0');
  readonly MAIL_USERNAME = process.env.MAIL_USERNAME || '';
  readonly MAIL_PASSWORD = process.env.MAIL_PASSWORD || '';
  readonly MAIL_SENDER = process.env.MAIL_SENDER || '';
}

/**
 *     host: string,
    port: number,
    username: string,
    password: string,
    sender: string
 */

const config = new Config();
const errors = validateSync(config);
if (errors.length) {
  const errText = errors.map((e) => e.toString()).join('\n');
  throw new Error(
    `Wrong environment in ${Config.name}. Fatal error.\n${errText}`,
  );
}

export default config;
