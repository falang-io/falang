import { randomBytes } from 'node:crypto';

/** 16 random bytes, base64url — a 22-character `files.id`. Unguessable but not itself a capability (see the entity's doc comment). */
export const generateFileId = (): string => randomBytes(16).toString('base64url');

/** 32 random bytes, base64url — a 43-character `files.public_token`, the capability URL minted by `files-publish`. */
export const generatePublicToken = (): string => randomBytes(32).toString('base64url');
