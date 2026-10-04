import { listTree, readDocument } from '@falang/desktop-project-fs';
import { DEVICES_DOCUMENT_TYPE, parseDevicesDocumentData } from '@falang/desktop-arduino-dto';
import type { IDriverValidationProject } from '@falang/desktop-arduino-compiler';

/** The project's documents and parsed `Devices` data — what driver validation checks existing usages against. */
export const readProjectContext = async (projectDir: string): Promise<IDriverValidationProject> => {
  const tree = await listTree(projectDir);
  const documents = await Promise.all(tree.documents.map((doc) => readDocument(projectDir, doc.id)));
  const devices = documents.find((document) => document.type === DEVICES_DOCUMENT_TYPE);
  let devicesData = null;
  if (devices?.data) {
    try {
      devicesData = parseDevicesDocumentData(devices.data);
    } catch {
      devicesData = null;
    }
  }
  return { devicesData, documents };
};
