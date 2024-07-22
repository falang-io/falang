import { getTextDoc } from './domains/try-page/temp-docs/textDoc';
import * as fs from 'fs';
fs.writeFileSync('/tmp/a.json', JSON.stringify(getTextDoc(), undefined, 2),)
export {};