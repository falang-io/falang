import { ProjectType } from '@falang/editor-scheme';

export class CodeProjectType extends ProjectType {
  constructor(name: string) {
    super({
      documentsConfig: [{
        infrastructure: name,
        name: 'function',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('function', null);
        },
      }],
      name,
      sideBarEditor: null
    });
  }
}