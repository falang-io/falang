import React from 'react';
import styled from 'styled-components'
import { observer } from 'mobx-react';
import { ActivitiesTabIcons, ActivitiesTabIds, IdeStore } from './Ide.store'
import { Icon } from '@blueprintjs/core';
import { runInAction } from 'mobx';
import { NewFileDialogComponent } from './dialogs/new-file/NewFileDialog.component';
import { PromptDialogComponent } from './dialogs/prompt/PromptDialog.component';
import { SelectLanguageDialogComponent } from './dialogs/select-language/SelectLanguageDialog.component';
import { ProjectSchemeEditorTabStore } from './store/tabs/SchemeEditorTab.store';
import { SchemeComponent } from '@falang/editor-scheme';
import { WelcomeComponent } from './Welcome.component';
import { NewProjectDialogComponent } from './dialogs/new-project/NewProjectDialog.component';
import { SideBarComponent } from './sidebar/SideBar.component';
import { SettingsDialogComponent } from './dialogs/settings/SettingsDialog.cmp';

interface IdeComponentProps {
  ide: IdeStore
}

const IdeLayout = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  column-gap: 0px;
`;

const ActivityBarLayout = styled.div`
  width: 45px;
  background: #eee;
`;

const ActivityBarIcon = styled.div`
  width: 45px;
  padding: 6px;
  cursor: pointer;
  &:hover {
    background: #ddd;
  }
`
const TabsLayout = styled.div`
  flex: 1;
  height: 100%;
  position: relative;
`;

const TabLayout = styled.div`
  position: absolute;
  left: 0;
  top: 30px;
  width: 100%;
  height: calc(100% - 30px);  
`;

const SideBarResizer = styled.div`
  cursor: ew-resize;
  width: 4px;
  border-right: 1px solid #d3d5d7; 
`;

export const IdeComponent: React.FC<IdeComponentProps> = observer(({ ide }) => {
  const tabIndex = ide.activeTabIndex;
  const tabs = ide.tabs;
  const t = ide.frontRoot.lang.t;
  const tab = tabs[tabIndex];
  let tabNode: React.ReactNode;
  if (tab instanceof ProjectSchemeEditorTabStore) {
    tabNode = tab.loaded ? <SchemeComponent scheme={tab.scheme} /> : <>{t('base:loading')}...</>;
  }
  if (!tabNode) {
    tabNode = <WelcomeComponent root={ide.frontRoot} />;
  }
  return <>
    <IdeLayout
      onMouseMove={(e) => { ide.onMouseMove(e) }}
      onMouseUp={(e) => { ide.onMouseUp(e) }}
    >
      <ActivityBarLayout>
        {ActivitiesTabIds.map((tabName) => {
          const isActive = tabName === ide.selectedActivityTab;
          if(tabName === 'instruments' && ide.readonly) return null;
          return <ActivityBarIcon
            key={tabName}
            onClick={() => {
              ide.setActivityTabName(tabName);
            }}
            style={{
              borderLeft: isActive ? '2px solid #0c42b6' : '2px solid #eee',
              color: isActive ? '#333' : '#999'
            }}
          >
            <Icon
              icon={ActivitiesTabIcons[tabName]}
              size={30}
            />

          </ActivityBarIcon>;
        })}
      </ActivityBarLayout>
      <SideBarComponent ide={ide} />
      <SideBarResizer onMouseDown={(e) => ide.sideBar.startResizing(e)} />
      <TabsLayout>
        {tabs.length > 0 ? <div className="bp5-tabs">
          <ul className="bp5-tab-list" role="tablist">
            {tabs.map((tab, index) => {
              const TabIcon = tab.getIcon();
              return <li
                className="bp5-tab"
                role="tab"
                key={index}
                onClick={() => runInAction(() => {
                  ide.activeTabIndex = index;
                })}
                aria-selected={index === tabIndex}
              >
                {TabIcon ? <>&nbsp;<TabIcon size={18} /></> : null}
                &nbsp;
                {tab.title}
                {tab.modified ? '*' : ''}
                &nbsp;
                <Icon icon='cross' onClick={(e) => {
                  e.stopPropagation();
                  ide.closeTab(index);
                }} />
              </li>
            })}
          </ul>
        </div> : null}
        <TabLayout>
          {tabNode}
        </TabLayout>
      </TabsLayout>
    </IdeLayout>
    <NewFileDialogComponent dialog={ide.dialogs.newFileDialog} />
    <NewProjectDialogComponent dialog={ide.dialogs.newProjectDialog} />
    <PromptDialogComponent dialog={ide.dialogs.promptDialog} />
    <SelectLanguageDialogComponent dialog={ide.dialogs.selectLanguage} />
    <SettingsDialogComponent ide={ide} />
  </>
});
