import { observer } from 'mobx-react';
import { TryPageLanguages, TryPageStore, tryPageLanguageNames } from './TryPageStore';
import styled from 'styled-components';
import { SwitchesColors } from './SwitchesSolors';
import { Tab, Tabs } from '@blueprintjs/core';
import { codeTabs } from './codeTabs';
import { runInAction } from 'mobx';
import {  Button, ButtonGroup, FormGroup, InputGroup } from '@blueprintjs/core'

const Layout = styled.div`
  position: absolute;
  top: 50px;
  left: 0px;
  display: flex;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: hidden;
  height: calc(100% - 50px);
  width: 100%;
  & > * {
    width: 100%;
  }
  flex-wrap: wrap;
`;

const TopLayout = styled.div`
  height: 70px;
  width: 100%;
  box-sizing: border-box;
  padding: 5px 20px 0;
  display: flex;
  border-bottom: 1px solid #aaa;
  & > * {
    padding-right: 20px;
    width: auto;
  }
`;

const BottomLayout = styled.div`
  height: calc(100% - 70px);
  display: flex;
  width: 100%;
`;

const EditorLayout = styled.div`
  position: relative;
  flex: 1;
`;

const CodeRightLayout = styled.div`
  max-width: 500px;
  flex: 1;
  display: flex;
  height: 100%;
  flex-direction: column;
`;

const CodeTabsLayout = styled.div`
  height: 30px;
  width: 100%;
  padding: 0 5px;
`

const CodeLayout = styled.pre`
  flex: 1;
  width: 100%;
  background: #ccc;
  overflow-y: auto;
  overflow-x: auto;
  box-sizing: border-box;
  padding: 10px;
  margin: 0;
`;

export const TryPageComponent: React.FC<{
  page: TryPageStore,
}> = observer(({ page }) => {
  const t = page.root.i18n.t;
  const isMobile = page.root.windowSize.isMobile;
  if (!page.loaded) return null;
  const registry = page.registry;
  if (!registry.loaded) return null;
  return <Layout>
    <TopLayout>
      <FormGroup
        label={t('base:language')}
        labelFor="text-input"
      >
        <ButtonGroup>
          {TryPageLanguages.map((lang) => (
            <Button
              key={lang}
              onClick={() => page.loadLanguage(lang)}
              intent={page.selectedLanguage === lang ? 'primary' : 'none'}
            >
              {tryPageLanguageNames[lang]}
            </Button>
          ))}
        </ButtonGroup>
      </FormGroup>
      {isMobile ? null : <FormGroup
        style={{
          width: 'auto',
        }}
        label={t('base:mode')}
        labelFor="text-input"
      >
        <ButtonGroup>
          <Button
            onClick={() => page.setEditorMode('edit')}
            intent={page.editor.mode === 'edit' ? 'primary' : 'none'}
            icon='edit'
          >
            {t('base:edit')}
          </Button>
          <Button
            onClick={() => page.setEditorMode('view')}
            intent={page.editor.mode === 'view' ? 'primary' : 'none'}
            icon='eye-open'
          >
            {t('base:view')}
          </Button>
        </ButtonGroup>
      </FormGroup>}
      {page.selectedLanguage === 'logic' || isMobile ? null : <FormGroup
        label={page.isIconsSelected ? t('scheme:selected-icon-color') : t('scheme:default-icon-color')}
        labelFor="sidebar-color-select"
        style={{ width: '110px' }}
        disabled={page.editor.mode === 'view'}
      >
        <InputGroup
          disabled={page.editor.mode === 'view'}
          id="sidebar-color-select"
          value={page.currentColor}
          style={{ backgroundColor: page.currentColor.match(/^#[a-zA-Z0-9]{6}$/) ? page.currentColor : '#ffffff' }}
          onFocus={() => page.setPickerVisible(true)}
          onChange={(el) => {
            const color = el.currentTarget.value;
            page.setCurrentColor(color);
          }}
        />
        {page.pickerVisible ? <>
          <div style={{ position: 'absolute', zIndex: 10 }}>
            <div
              style={{
                position: 'fixed',
                top: '0px',
                right: '0px',
                bottom: '0px',
                left: '0px',
              }}
              onClick={() => page.setPickerVisible(false)}
            ></div>
            <registry.reactColor.SwatchesPicker
              color={page.currentColor}
              colors={SwitchesColors}
              onChange={(color) => {
                page.setCurrentColor(color.hex);
              }}
            />
          </div>
        </> : null}
      </FormGroup>}

      {page.selectedLanguage === 'logic' || isMobile ? null : <FormGroup
        label={t('scheme:scheme-background-color')}
        labelFor="sidebar-scheme-color-select"
        style={{ width: '110px' }}
        disabled={page.editor.mode === 'view'}
      >
        <InputGroup
          id="sidebar-scheme-color-select"
          value={page.currentSchemeBackgroundColor}
          disabled={page.editor.mode === 'view'}
          style={{ backgroundColor: page.currentSchemeBackgroundColor.match(/^#[a-zA-Z0-9]{6}$/) ? page.currentSchemeBackgroundColor : '#ffffff' }}
          onFocus={() => page.setSchemePickerVisible(true)}
          onChange={(el) => {
            const color = el.currentTarget.value;
            page.setSchemeBackgroundColor(color);
          }}
        />
        {page.schemePickerVisible ? <>
          <div style={{ position: 'absolute', zIndex: 10 }}>
            <div
              style={{
                position: 'fixed',
                top: '0px',
                right: '0px',
                bottom: '0px',
                left: '0px',
              }}
              onClick={() => page.setSchemePickerVisible(false)}
            ></div>
            <registry.reactColor.SwatchesPicker
              color={page.currentSchemeBackgroundColor}
              colors={SwitchesColors}
              onChange={(color) => {
                page.setSchemeBackgroundColor(color.hex);
              }}
            />
          </div>
        </> : null}
      </FormGroup>}
    </TopLayout>
    <BottomLayout>
      <EditorLayout style={{ background: page.editor.editorBackgroundColor }}>
        {!page.editorVisible ? null : <h1>Loading...</h1>}
        <div style={{
          visibility: page.editorVisible ? 'visible' : 'hidden'
        }}>
          <page.editorImporter.importedEditor.editor.SchemeComponent scheme={page.editor} />
        </div>
      </EditorLayout>
      {page.isCodeVisible ? <CodeRightLayout>
        <CodeTabsLayout>
          <Tabs
            selectedTabId={page.selectedCodeTab}
            onChange={(tabId) => runInAction(() => page.selectedCodeTab = tabId as string)}
          >
            {Object.keys(codeTabs).map((tabKey) => <Tab
              id={tabKey}
              key={tabKey}
              title={codeTabs[tabKey]}
            />)}
          </Tabs>
        </CodeTabsLayout>
        <CodeLayout className={page.codeClassName} dangerouslySetInnerHTML={{
          __html: page.code,
        }} />
      </CodeRightLayout> : null}

    </BottomLayout>

  </Layout>;
});
