import { validateSync, IsString, IsNotEmpty, IsNumber } from 'class-validator';
import '../../../config';

class DatabaseConfig {
  @IsString()
  @IsNotEmpty()
  readonly DB_HOST = process.env.DB_HOST || '';

  @IsNumber()
  readonly DB_PORT = parseInt(process.env.DB_PORT || '');

  @IsString()
  @IsNotEmpty()
  readonly DB_USER = process.env.DB_USER || '';

  @IsString()
  @IsNotEmpty()
  readonly DB_PASSWORD = process.env.DB_PASSWORD || '';

  @IsString()
  @IsNotEmpty()
  readonly DB_DATABASE = process.env.DB_DATABASE || '';
}

const config = new DatabaseConfig();
const errors = validateSync(config);
if (errors.length) {
  const errText = errors.map((e) => e.toString()).join('\n');
  throw new Error(
    `Wrong environment in ${DatabaseConfig.name}. Fatal error.\n${errText}`,
  );
}

export default config;
