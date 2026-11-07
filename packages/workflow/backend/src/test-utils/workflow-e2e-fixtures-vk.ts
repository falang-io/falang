import type { INode } from '@falang/dto';

/**
 * Node builders for the VK community-management workflow-tier fixtures (ADR 0076 (private)) — same shapes as
 * `@falang/workflow-integrations-vk`'s action descriptors. A separate file (like the files/media/db ones) to stay under
 * `workflow-e2e-fixtures.ts`'s line cap.
 */
export const buildVkSendMessageNode = (
  id: string,
  fields: { readonly credentialId: string; readonly chatId: string; readonly text: string },
): INode => ({
  id,
  name: 'vk-send-message',
  data: { credentialId: fields.credentialId, chatId: fields.chatId, text: fields.text },
});

/** `chatId` is the conversation `peer_id` (an expression), `userId` the member to remove (an expression). */
export const buildVkKickFromChatNode = (
  id: string,
  fields: { readonly credentialId: string; readonly chatId: string; readonly userId: string },
): INode => ({
  id,
  name: 'vk-kick-from-chat',
  data: { credentialId: fields.credentialId, chatId: fields.chatId, userId: fields.userId },
});

/** `chatId` is the `peer_id`, `messageId` the `conversation_message_id` (both expressions). */
export const buildVkDeleteMessageNode = (
  id: string,
  fields: { readonly credentialId: string; readonly chatId: string; readonly messageId: string },
): INode => ({
  id,
  name: 'vk-delete-message',
  data: { credentialId: fields.credentialId, chatId: fields.chatId, messageId: fields.messageId },
});
