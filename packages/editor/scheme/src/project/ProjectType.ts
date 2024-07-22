
import { IProjectTypeConfig } from './TProjectType';
import { FrontRootStore } from '@falang/frontend-core';
import { ProjectStore } from './ProjectStore';

export abstract class ProjectType {
  

  constructor(
    readonly config: IProjectTypeConfig
  ) {
    
  }

  createProjectStore(frontRoot: FrontRootStore): ProjectStore | null {
    return null;
  }

}
