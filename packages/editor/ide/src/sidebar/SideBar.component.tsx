import React from 'react';
import { observer } from 'mobx-react';
import { SideBarInstrumentsComponent } from './instruments/SideBarInstruments.component';
import { SideBarFilesTreeComponent } from './files/SideBarFilesTree.component';
import { IdeStore } from '../Ide.store';


export interface ISideBarComponentProps {
  ide: IdeStore
}

export const SideBarComponent: React.FC<ISideBarComponentProps> = observer(({ ide }) => {
  if (ide.rootDirectory.path === '') return null;
  if (ide.selectedActivityTab === 'explorer') {
    return <SideBarFilesTreeComponent ide={ide}/>;
  }
  if(ide.selectedActivityTab === 'instruments') {
    return <SideBarInstrumentsComponent ide={ide} />
  }
  return <>Wrong tab</>;
});
