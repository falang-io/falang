import { isValidFunctionName } from '@falang/dto';
import { DOCUMENT_TYPES, type DocumentType } from '../desktop-project-store.js';

/** The project tree's per-type icons/placeholders and the "create a document/folder" dialog's rules. */

export const DOC_ICONS: Record<DocumentType, string> = {
  contour: '⚙',
  'text-function': 'ƒ',
  'mind-tree': '🌳',
  function: 'ƒ',
  'objects-structure': '▤',
  'enum-structure': '☰',
  'external-api-structure': '☁',
  'simple-code-cpp': 'C',
  'simple-code-js': 'J',
  'simple-code-ts': 'T',
  'simple-code-php': 'P',
  'simple-code-rust': '🦀',
};
export const ITEM_ICONS: Record<DocumentType | 'folder', string> = { folder: '📁', ...DOC_ICONS };
export const PLACEHOLDERS: Record<DocumentType | 'folder', string> = {
  folder: 'Folder name...',
  contour: 'Contour name...',
  'text-function': 'Function name...',
  'mind-tree': 'Tree name...',
  function: 'Logic function name...',
  'objects-structure': 'Structure name...',
  'enum-structure': 'Enum name...',
  'external-api-structure': 'External API name...',
  'simple-code-cpp': 'C++ file name...',
  'simple-code-js': 'JavaScript file name...',
  'simple-code-ts': 'TypeScript file name...',
  'simple-code-php': 'PHP file name...',
  'simple-code-rust': 'Rust file name...',
};
export const DOC_TYPE_ORDER: DocumentType[] = [
  'text-function',
  'contour',
  'mind-tree',
  'function',
  'objects-structure',
  'enum-structure',
  'external-api-structure',
  'simple-code-cpp',
  'simple-code-js',
  'simple-code-ts',
  'simple-code-php',
  'simple-code-rust',
];

export interface NewItem {
  type: DocumentType | 'folder';
  parentId: string | null;
}

const FUNCTION_NAME_RULE =
  'Function name must be English, camelCase (e.g. myFunctionName) — no spaces, punctuation, or a leading digit';

export const validateNewItemName = (type: NewItem['type'], name: string): string | null => {
  if (!name.trim()) return 'Name is required';
  if (type === 'function' && !isValidFunctionName(name.trim())) return FUNCTION_NAME_RULE;
  return null;
};

export const newItemTitle = (type: NewItem['type']): string =>
  `${ITEM_ICONS[type]} New ${type === 'folder' ? 'folder' : DOCUMENT_TYPES[type].label.toLowerCase()}`;
