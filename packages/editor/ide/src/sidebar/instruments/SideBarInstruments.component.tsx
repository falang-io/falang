import { observer } from 'mobx-react';
import { FormGroup, InputGroup } from '@blueprintjs/core';
import { ProjectNameLayout, SideBarLayout } from '../styled.component';
import { SwatchesPicker } from 'react-color';
import React from 'react';
import styled from 'styled-components';
import { SwitchesColors } from './SwitchesSolors';
import { Switch } from '@blueprintjs/core';
import { IdeStore } from '../../Ide.store';

export interface ISideBarInstrumentsComponentProps {
  ide: IdeStore
}



export const SideBarInstrumentsComponent: React.FC<ISideBarInstrumentsComponentProps> = observer(({ ide }) => {
  const t = ide.frontRoot.lang.t;
  const instruments = ide.sideBar.instruments;
  return <SideBarLayout style={{ width: ide.sideBar.width }}>
    <ProjectNameLayout>{ide.name}</ProjectNameLayout>
    <div
      style={{
        padding: '10px',
      }}
    >
      <Switch
        label={t('project:editing-mode')}
        checked={ide.isEditing}
        onChange={(p) => {
          ide.setIsEditing(p.currentTarget.checked);
        }}
      />
      <Switch
        label={t('project:icons-enumerator')}
        checked={ide.isEnumerator}
        onChange={(p) => {
          ide.setIsEnumerator(p.currentTarget.checked);
        }}
      />
      <Switch
        label={t('project:enable-gap-controls')}
        checked={ide.gapControlsEnabled}
        onChange={(p) => {
          ide.setGapControlsEnabled(p.currentTarget.checked);
        }}
      />
      {ide.isEditing ? <>
        {ide.projectType?.config.editableIconColor ? <FormGroup
          label={instruments.isIconsSelected ? t('scheme:selected-icon-color') : t('scheme:default-icon-color')}
          labelFor="sidebar-color-select"
        >
          <InputGroup
            id="sidebar-color-select"
            value={instruments.currentColor}
            style={{ backgroundColor: instruments.currentColor.match(/^#[a-zA-Z0-9]{6}$/) ? instruments.currentColor : '#ffffff' }}
            onFocus={() => instruments.setPickerVisible(true)}
            onChange={(el) => {
              const color = el.currentTarget.value;
              instruments.setCurrentColor(color);
            }}
          />

          {instruments.pickerVisible ? <>
            <div style={{ position: 'absolute', zIndex: 10 }}>
              <div
                style={{
                  position: 'fixed',
                  top: '0px',
                  right: '0px',
                  bottom: '0px',
                  left: '0px',
                }}
                onClick={() => instruments.setPickerVisible(false)}
              ></div>
              <SwatchesPicker
                color={instruments.currentColor}
                colors={SwitchesColors}
                onChange={(color) => {
                  instruments.setCurrentColor(color.hex);
                }}
              />
            </div>
          </> : null}
        </FormGroup> : null}

        {(!instruments.isIconsSelected) ? <FormGroup
          label={t('scheme:scheme-background-color')}
          labelFor="sidebar-scheme-color-select"
        >
          <InputGroup
            id="sidebar-scheme-color-select"
            value={instruments.currentSchemeBackgroundColor}
            style={{ backgroundColor: instruments.currentSchemeBackgroundColor.match(/^#[a-zA-Z0-9]{6}$/) ? instruments.currentSchemeBackgroundColor : '#ffffff' }}
            onFocus={() => instruments.setSchemePickerVisible(true)}
            onChange={(el) => {
              const color = el.currentTarget.value;
              instruments.setSchemeBackgroundColor(color);
            }}
          />
          {instruments.schemePickerVisible ? <>
            <div style={{ position: 'absolute', zIndex: 10 }}>
              <div
                style={{
                  position: 'fixed',
                  top: '0px',
                  right: '0px',
                  bottom: '0px',
                  left: '0px',
                }}
                onClick={() => instruments.setSchemePickerVisible(false)}
              ></div>
              <SwatchesPicker
                color={instruments.currentSchemeBackgroundColor}
                colors={SwitchesColors}
                onChange={(color) => {
                  instruments.setSchemeBackgroundColor(color.hex);
                }}
              />
            </div>
          </> : null}
        </FormGroup> : null}
      </> : null}
    </div>
  </SideBarLayout>
});
