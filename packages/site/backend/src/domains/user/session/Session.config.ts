import { IsString, IsNotEmpty, validateSync } from 'class-validator';
import '../../../config';

class SessionConfig {
  @IsString()
  @IsNotEmpty()
  readonly SESSION_SECRET = process.env.SESSION_SECRET || '';
}

const config = new SessionConfig();
const errors = validateSync(config);
if (errors.length) {
  const errText = errors.map((e) => e.toString()).join('\n');
  throw new Error(
    `Wrong environment in ${SessionConfig.name}. Fatal error.\n${errText}`,
  );
}

export default config;
