import type { IProjectDocument } from '@falang/dto';
import { listTree, readDocument } from '@falang/desktop-project-fs';
import {
  DEVICES_DOCUMENT_TYPE,
  parseDevicesDocumentData,
  type IDevicesDocumentData,
} from '@falang/desktop-arduino-dto';
import type { IDriverValidationProject } from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';

/** The `Devices` document's data when it parses, else `null` (a broken document must not stop driver management). */
export const devicesDataOf = (documents: readonly IProjectDocument[]): IDevicesDocumentData | null => {
  const devices = documents.find((document) => document.type === DEVICES_DOCUMENT_TYPE);
  if (!devices?.data) return null;
  try {
    return parseDevicesDocumentData(devices.data);
  } catch {
    return null;
  }
};

export const toDriverProjectContext = (documents: readonly IProjectDocument[]): IDriverValidationProject => ({
  documents,
  devicesData: devicesDataOf(documents),
});

/** Every document of the project on disk, shaped for driver validation/adoption/usage checks. */
export const readDriverProjectContext = async (projectDir: string): Promise<IDriverValidationProject> => {
  const tree = await listTree(projectDir);
  const documents = await Promise.all(tree.documents.map((doc) => readDocument(projectDir, doc.id)));
  return toDriverProjectContext(documents);
};
