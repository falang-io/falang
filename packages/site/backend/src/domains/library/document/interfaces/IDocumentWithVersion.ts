import type { Document } from '../entites/Document.entity';
import type { DocumentVersion } from '../entites/DocumentVersion.entity';

export interface IDocumentWithVersion {
  document: Document;
  version: DocumentVersion;
}
