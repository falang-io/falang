import { runInAction } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';
import '../css/header.css';
import { DropDownButtonComponent } from '../../dropdown/cmp/DropDownButton.cmp';
import { LangSwitchComponent } from '../../i18n/LangSwitch.cmp';
import { useRoot } from '../../store/Root.context';
import styled from 'styled-components';
import { MdOutlineSettings, MdClose, MdEdit, MdAccountCircle, MdInfo, MdGetApp } from 'react-icons/md'
import { Button, Menu, MenuItem, Popover } from '@blueprintjs/core';
import { CELL_SIZE } from '@falang/editor-scheme';

const DocumentTitleSpan = styled.span`
  display: inline-block;
  padding: 0 10px;
  white-space: nowrap;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 1.8rem;
  line-height: 1.8rem;
  font-style: italic;
`;


export const LayoutHeader: React.FC = observer(() => {
  const root = useRoot();
  const { router, routes, i18n, user, modals, windowSize } = root;
  const { isMyDocument, isLocalStorageDocument, isSaving, loaded: documentEditorLoaded } = root.documentEditorPage;
  const editor = root.documentEditorPage.editor;
  const t = i18n.t;
  const { loggedIn, username } = user;

  const FalangMenu = <Menu>
    <MenuItem text={t('home')} onClick={() => location.href = 'https://falang.io'} />
    <MenuItem text={t('my-documents')} onClick={() => router.goTo(routes.home)} />
    <MenuItem text={t('library')} onClick={() => router.goTo(routes.sharedDocuments)} />
    <MenuItem text={t('base:docs')} onClick={() => location.href = `https://falang.io/${root.i18n.lang}/docs/`} />
    {!loggedIn && windowSize.isMobile ? <div><LangSwitchComponent root={root} i18n={i18n} /></div> : null}
  </Menu>;

  return <nav className="bp5-navbar bp5-dark">
    {/*<div style="margin: 0 auto; width: 480px;"> <!-- ADD ME -->*/}
    <div className="bp5-navbar-group bp5-align-left">
      <Popover content={FalangMenu} fill={true} placement="bottom">
        <Button
          className="bp5-button bp5-minimal"
          rightIcon="caret-down"
        >
          Falang
        </Button>
      </Popover>
      {documentEditorLoaded ? <>
        {editor.mode === 'view' ? (
          <>
            <DocumentTitleSpan
              style={{ cursor: 'pointer' }}
              onClick={() => modals.documentInfo.show()}
            >{editor.name}</DocumentTitleSpan>
            <Button
              minimal
              onClick={() => {
                modals.documentInfo.show();
              }}
              icon="info-sign"
            />
            {windowSize.isMobile ? null : <Button
              minimal
              icon="edit"
              onClick={() => {
                runInAction(() => {
                  if (isMyDocument) {
                    router.goTo(routes.editDocument, { id: editor.id })
                  } else {
                    root.documentEditorPage.startEditNotMyDocument();
                  }
                });
              }}
            />}

            <Button
              icon="download"
              minimal
              className='btn btn-link btn-doc-link'
              onClick={async () => {
                const cssResult = await fetch('/style-svg.css');
                const cssContents = await (await cssResult.blob()).text();
                runInAction(() => {
                  var svgData = document.getElementById(editor.id)?.outerHTML;
                  const root = editor.root;
                  if (!svgData || !root) return;
                  svgData = svgData.replace(/g transform="[^"]*"/, 'g');
                  const left = -root.shape.leftSize - 10;
                  const shapeLeft = -root.shape.leftSize - CELL_SIZE;
                  const top = -10;
                  const width = root.shape.rightSize + root.shape.leftSize + 20;
                  const height = root.shape.height + 20;
                  svgData = svgData.replace("<svg", `<svg viewBox='${left} ${top} ${width} ${height}'`);
                  svgData = svgData.replace('>', `><style>${cssContents}</style><rect x='${left}' y='${top}' width='${width}' height='${height}' fill='#C0E0E8'></rect>`);
                  svgData = svgData.replace('<rect width="100%" height="100%" x="0" y="0" fill="url(#star)">', `<rect width="${width + CELL_SIZE * 2}" height="${height + CELL_SIZE * 2}" x="${shapeLeft}" y="${-CELL_SIZE}" fill="url(#star)">`);
                  var svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                  var svgUrl = URL.createObjectURL(svgBlob);
                  var downloadLink = document.createElement("a");
                  downloadLink.href = svgUrl;
                  downloadLink.download = `${editor.name}.svg`;
                  document.body.appendChild(downloadLink);
                  downloadLink.click();
                  document.body.removeChild(downloadLink);
                });
              }}
            />
          </>
        ) : (
          <>
            <DocumentTitleSpan
              style={{ cursor: 'pointer' }}
              onClick={() => modals.documentSettings.show()}
            >{editor.name}</DocumentTitleSpan>
            {!(isLocalStorageDocument) ?
              <>
                <Button onClick={() => { modals.documentSettings.show() }} icon={<MdOutlineSettings />}></Button>
                &nbsp;
                <Button onClick={() => { router.goTo(routes.viewDocument, { id: editor.id }) }} icon={<MdClose />}></Button>
              </>
              : null}
          </>
        )}
      </> : null}
    </div>
    <div className="bp5-navbar-group bp5-align-right">
      {documentEditorLoaded && editor.mode === 'edit' ? <span>
        {isLocalStorageDocument ? <>
          {t('docs:saved_in_local')}
        </> : <>
          {isSaving ? <>
            <span className='loading' style={{ marginRight: '12px' }}></span> {t('docs:saving')}
          </> : root.documentEditorPage.lastSavedText ? `${t('docs:saved')} ${root.documentEditorPage.lastSavedText}` : ''}
        </>}
        &nbsp;&nbsp;
      </span> : null}
      {windowSize.isMobile ? null : <>
        {loggedIn ? null : <LangSwitchComponent root={root} i18n={i18n} />}
        {loggedIn ? <Popover
          content={<Menu>
            <MenuItem text={t('user:settings')} onClick={() => router.goTo(routes.userSettings)} />
            <MenuItem text={t('user:logout')} onClick={() => user.logout()} />
          </Menu>}
          fill={true}
          placement="bottom"
        >
          <Button
            icon="user"
            className="bp5-button bp5-minimal"
            rightIcon="caret-down"
          >
            {username || ''}
          </Button>
        </Popover> : <Button
          minimal
          icon="user"
          onClick={() => runInAction(() => modals.login.show())}
        >
          {t('login')}
        </Button>}
      </>}

    </div>
    {/*</div>*/}
  </nav>
});
