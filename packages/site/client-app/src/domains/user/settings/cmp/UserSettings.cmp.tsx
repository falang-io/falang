import { observer } from 'mobx-react';
import styled from 'styled-components';

import { FixedWidthLayout } from '../../../core/layout/cmp/FixedWidthLayout.cmp';

import type { TPage } from '../../../core/store/TPage.cmp';

import engIcon from 'flag-icons/flags/4x3/gb.svg';
import ruIcon from 'flag-icons/flags/4x3/ru.svg';
import '../css/settings.css';
import { Button, HTMLTable } from '@blueprintjs/core';

const LangImage = styled.img`
  width: 20px;
  height: 15px;
  border: 1px solid #aaa;
  vertical-align: middle;
`;

export const UserSettings: TPage = observer(({ root }) => {
  const { i18n, user, modals } = root;
  const t = i18n.t;
  const lang = i18n.lang;

  if (!user.loggedIn) return (
    <FixedWidthLayout>
      <h1>{t('user:settings')}</h1>
      <p>You are not logged in</p>
    </FixedWidthLayout>
  );
  return <FixedWidthLayout>
    <h1>{t('user:settings')}</h1>
    <div>
      <HTMLTable className="settings-table" style={{ width: '100%'}} interactive>
        <tbody>
          <tr>
            <td style={{ width: 200 }}>{t('user:username')}</td>
            <td>{user.username}</td>
          </tr>
          <tr>
            <td>{t('user:email')}</td>
            <td>{user.email}</td>
          </tr>
          <tr>
            <td>{t('language:lng')}</td>
            <td>
              <div className="form-group">
                <label className="form-radio">
                  <input
                    type="radio"
                    name="settings-language"
                    value='en'
                    onChange={(e) => i18n.setLang(e.target.value)}
                    checked={lang === 'en'}
                  />
                  <i className="form-icon"></i> <LangImage src={engIcon} /> {t('language:en')}
                </label>
                <label className="form-radio">
                  <input
                    type="radio"
                    name="settings-language"
                    value='ru'
                    onChange={(e) => i18n.setLang(e.target.value)}
                    checked={lang === 'ru'}
                  />
                  <i className="form-icon"></i> <LangImage src={ruIcon} /> {t('language:ru')}
                </label>
              </div>
            </td>
          </tr>
        </tbody>
      </HTMLTable>
    </div>
    <br/>
    <p>
      <Button className='btn' onClick={() => modals.changePassword.show()}>{t('user:change-password')}</Button>
    </p>
  </FixedWidthLayout>;
});
