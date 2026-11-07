import type { INode } from '@falang/dto';

/** `max-remove-member` node (ADR 0076 (private)) — `userId` is a TypeScript expression, `block` too (`'true'`/`'false'`). */
export const buildMaxRemoveMemberNode = (
  id: string,
  fields: { readonly credentialId: string; readonly chatId: string; readonly userId: string; readonly block?: string },
): INode => ({
  id,
  name: 'max-remove-member',
  data: { block: 'true', ...fields },
});

/** `max-delete-message` node — `messageId` is a TypeScript expression of type string. */
export const buildMaxDeleteMessageNode = (
  id: string,
  fields: { readonly credentialId: string; readonly messageId: string },
): INode => ({
  id,
  name: 'max-delete-message',
  data: { ...fields },
});
