import { observer } from 'mobx-react';
import moment from 'moment';

import { FixedWidthLayout } from '../../../core/layout/cmp/FixedWidthLayout.cmp';

import type { TPage } from '../../../core/store/TPage.cmp';

import { Link } from 'mobx-router';
import { HTMLTable, Icon } from '@blueprintjs/core';


export const DocumentListInternalComponent: TPage = observer(({ root }) => {
  const { router, routes, i18n: { t }, documentsList: list } = root;
  return <>
  {root.user.loggedIn === false && list.type === 'my' ? <>
    <h3>{t('webapp:you_need_login_to_save')}</h3>
  </> : null}
  
  {list.busy ? <div className="loading loading-lg"></div> : list.list.length > 0 ? (
    <HTMLTable striped width='100%'>
      <thead>
      <tr>
        <th>{t('base:name')}</th>
        <th>{t('base:updated')}</th>
        {list.type === 'my' ? <th style={{ width: '30px'}}></th> : null}
      </tr>
    </thead>
    <tbody>
      {list.list.map(item => (
        <tr key={item.id}>
          <td>
            <Link
              route={routes.viewDocument}
              params={{ id: item.id }}
              router={router}
            >
              {item.name}
            </Link>
          </td>
          <td>{moment(item.updated).fromNow()}</td>
          {list.type === 'my'
            ? <td align='right'>
              <button className="btn btn-error" onClick={() => list.delete(item.id)}>
                <Icon icon='delete' />
              </button>
            </td>
            : null}
        </tr>
      ))}
    </tbody>
    </HTMLTable>
  ) : (
    <div className="empty">
      <p className="empty-title h5">{t((root.user.loggedIn || list.type !== 'my') ? `docs:empty-${list.type}-docs` : 'base:not_logged_in')}</p>
    </div>
  )}</>
});
