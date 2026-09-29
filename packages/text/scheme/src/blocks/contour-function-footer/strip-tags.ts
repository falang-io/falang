export const stripTags = (text: string) => text.replaceAll(/<[^>]*>/g, '');
