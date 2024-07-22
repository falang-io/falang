import React from 'react'
import engIcon from './gb.svg';
import ruIcon from './ru.svg';
import { observer } from 'mobx-react';
import styled from 'styled-components';

import { RootStore } from '../store/Root.store';
import { LangState } from '@falang/frontend-core';
import { Button } from '@blueprintjs/core'

const SwitchDiv = styled.div`
  display: inline-box;
  position: relative;
  width: 33px;
  height: 26px;
`;

const MainLang = styled.img`
  position: absolute;
  left: 4px;
  top: 4px;
  width: 20px;
  height: 15px;
  border: 1px solid #aaa;
  z-index: 1;
`;

const OtherLang = styled.img`
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 20px;
  height: 15px;
  border: 1px solid #aaa;
  z-index: 0;
  opacity: 0.3;
`;

export const LangSwitchComponent: React.FC<{ i18n: LangState, root: RootStore }> = observer(({ i18n, root }) => {
  const lang = i18n.lang;
  const mainSource = lang === 'ru' ? ruIcon : engIcon;
  const otherSource = lang === 'ru' ? engIcon : ruIcon;

  return <Button
    minimal
    onClick={() => i18n.setLang(lang === 'ru' ? 'en' : 'ru')}
  >
    <SwitchDiv>
      <OtherLang src={otherSource} />
      <MainLang src={mainSource} />
    </SwitchDiv>
  </Button>
});
