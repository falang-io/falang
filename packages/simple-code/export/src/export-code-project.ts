import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import {
  CODE_FILE_EXTENSIONS,
  CODE_LANGUAGE_BY_DOCUMENT_TYPE,
  isCodeDocumentType,
  type TCodeDocumentType,
  type TCodeLanguage,
} from '@falang/simple-code-dto';
import { generateCode } from './generate-code.js';

/** One document finished (successfully or not) — `done` counts completed documents, 1-based. Reported synchronously as each one resolves, in the same order `planExports` produced. */
export interface ICodeExportProgress {
  readonly done: number;
  readonly total: number;
  readonly documentName: string;
}

export interface IExportCodeProjectParams {
  /** The project's root directory — output goes under `<projectDir>/generated`. */
  readonly projectDir: string;
  readonly documents: readonly IProjectDocument[];
  /** Called once per document, after it settles — same posture as `@falang/logic-export`'s own
   * `onProgress` (see its doc comment), for the same off-main-thread-with-a-progress-bar reason. */
  readonly onProgress?: (progress: ICodeExportProgress) => void;
}

export interface ICodeExportFileResult {
  readonly documentId: string;
  readonly documentName: string;
  readonly language: string;
  readonly ok: boolean;
  readonly path?: string;
  readonly error?: string;
}

export interface ICodeExportResult {
  readonly items: readonly ICodeExportFileResult[];
}

const safeFileName = (name: string): string => name.replaceAll(/[^\w.-]/g, '_');

interface IPlannedExport {
  readonly doc: IProjectDocument;
  readonly language: TCodeLanguage;
  readonly fileName: string;
}

/** One pass, synchronous, to make duplicate-name disambiguation deterministic before any I/O starts. */
const planExports = (documents: readonly IProjectDocument[]): IPlannedExport[] => {
  const usedFileNames = new Set<string>();
  return documents
    .filter((doc): doc is IProjectDocument & { type: TCodeDocumentType } => isCodeDocumentType(doc.type))
    .map((doc) => {
      const language = CODE_LANGUAGE_BY_DOCUMENT_TYPE[doc.type];
      let fileName = `${safeFileName(doc.name)}.${CODE_FILE_EXTENSIONS[language]}`;
      if (usedFileNames.has(fileName)) {
        fileName = `${safeFileName(doc.name)}-${doc.id.slice(0, 6)}.${CODE_FILE_EXTENSIONS[language]}`;
      }
      usedFileNames.add(fileName);
      return { doc, language, fileName };
    });
};

const exportOne = async (outputDir: string, planned: IPlannedExport): Promise<ICodeExportFileResult> => {
  const { doc, language, fileName } = planned;
  const base = { documentId: doc.id, documentName: doc.name, language };
  try {
    if (!doc.root) throw new Error('Document has no root node');
    const code = generateCode(doc.root, language);
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, code);
    return { ...base, ok: true, path: filePath };
  } catch (error) {
    // A failed document never stops the others — same posture as `@falang/logic-export`'s `exportOne`.
    return { ...base, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Compiles every `code-*` document in the project (one document = one root node = one output file,
 * unlike `@falang/logic-export`'s whole-project aggregation — language is already fixed per document
 * type here, so there's no multi-language fan-out to configure) and writes each to
 * `<projectDir>/generated/<documentName>.<ext>`.
 */
export const exportCodeProject = async ({
  projectDir,
  documents,
  onProgress,
}: IExportCodeProjectParams): Promise<ICodeExportResult> => {
  const planned = planExports(documents);
  if (planned.length === 0) return { items: [] };

  const outputDir = path.join(projectDir, 'generated');
  await fs.mkdir(outputDir, { recursive: true });

  // Sequential — same reasoning as `@falang/logic-export`'s own `exportLogicProject`: gives
  // `onProgress` a well-defined "N of M done" callback instead of one opaque all-at-once wait.
  const items: ICodeExportFileResult[] = [];
  for (const [index, planned_] of planned.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- deliberately sequential, see comment above.
    const itemResult = await exportOne(outputDir, planned_);
    items.push(itemResult);
    onProgress?.({ done: index + 1, total: planned.length, documentName: planned_.doc.name });
  }
  return { items };
};
