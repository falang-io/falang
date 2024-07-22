import { observer } from 'mobx-react';
import type { TPage } from '../../../core/store/TPage.cmp';
import styled from 'styled-components';
import { ContentLayout } from '../../../core/layout/cmp/ContentLayout.cmp';
import { Button} from '@blueprintjs/core'

const PinkLayout = styled.div`
  background: #3c065e;
  font-size: 1.3em;
  color: #ddd;
  box-sizing: border-box;
`;

const FixedWidth = styled.div`
  padding: 40px 20px;
  max-width: 1140px;
  margin: 0 auto;
  box-sizing: border-box;
`

const LeftLayoutItem = styled.div`
  box-sizing: border-box;
  float: left;
  @media (min-width:801px) {
    width: 46%;
    margin-right: 8%;
  }
  @media (max-width:800px) {
    width: 100%;
  }
`;

const IntroBottomLine = styled.div`
  width: 100px;
  height: 0px;
  border-top: 6px solid #29b7dd;
  margin: 10px auto 0 0;
`;


const RightLayoutItem = styled.div`
  box-sizing: border-box;
  float: left;
  @media (min-width:801px) {
    width: 46%;
  }
  @media (max-width:800px) {
    width: 100%;
  }
`;

const IntroImage = styled.img`
  width: 100%;
`;

const TemplateCard = styled.div`
    @media (min-width:801px) {
    width: 30%;
  }
  @media (max-width:800px) {
    width: 100%;
  }
  & img {
    width: 100%;
    border: 1px solid #ddd;
  }
  float: left;
  margin-right: 3%;
`

export const HomeComponent: TPage = observer(({ root }) => {
  const { i18n, router, routes } = root;
  const templateNames = ['function', 'lifegram'];
  const t = i18n.t;
  return <ContentLayout>
    <PinkLayout>
      <FixedWidth>
        <LeftLayoutItem>
          <h1>{t('intro:title')}</h1>
          <p>{t('intro:subtitle')}</p>
          {t('for-news-check-out')} <a href='https://t.me/falang_io' style={{ color: '#6390cf' }}>{t('telegran-channel')}</a>.
          <p>

          </p>
          <div><a href="https://snapcraft.io/falang">
            <img alt="Get it from the Snap Store" src="https://snapcraft.io/static/images/badges/en/snap-store-black.svg" />
          </a></div>

        </LeftLayoutItem>
        <RightLayoutItem>
          <IntroImage src='/images/intro-pc.jpg' />
        </RightLayoutItem>
        <div style={{ clear: 'both' }}></div>
      </FixedWidth>
    </PinkLayout>
    <FixedWidth>
      <LeftLayoutItem>
        <IntroImage src='/images/pc1.jpg' />
      </LeftLayoutItem>
      <RightLayoutItem>
        <h1>{t('intro:available_for_everyone')}</h1>
        <div style={{
          fontSize: '1.4em',
          marginTop: '40px',
        }}>
          {t('intro:available_for_everyone_descr')}
        </div>

      </RightLayoutItem>
      <div style={{ clear: 'both' }}></div>
    </FixedWidth>
    <PinkLayout>
      <FixedWidth>
        <LeftLayoutItem>
          <h1>{t('intro:big_theory')}</h1>
          <p>{t('intro:big_theory_description')}</p>
          <p>
            <br />
            <Button intent='success' icon='rocket' large onClick={() => window.open('https://drakon.su/')}>{t('intro:drakon_more')}</Button>
          </p>
        </LeftLayoutItem>
        <RightLayoutItem>
          <IntroImage src='/images/buran.jpg' />
        </RightLayoutItem>
        <div style={{ clear: 'both' }}></div>
      </FixedWidth>
    </PinkLayout>
    <FixedWidth>
      <LeftLayoutItem>
        <h2 style={{ fontSize: '2.5em', fontWeight: 'normal', marginBottom: 20 }}>
          {t('intro:falang_model')}
        </h2>
        <IntroBottomLine />
      </LeftLayoutItem>
      <RightLayoutItem>
        <div style={{
          fontSize: '1.4em',
          marginTop: '40px',
        }}>
          <p>"<i>{t('intro:falang_model_comment')}.</i>"</p>
          <p>{t('intro:falang_model_comment_sign')}</p>
          <p>&nbsp;</p>
        </div>
      </RightLayoutItem>
      <div style={{ clear: 'both' }}></div>
    </FixedWidth>
    <a id='try' href='/' />
    <PinkLayout>
      <FixedWidth>
        <h2 style={{ fontSize: '2.5em', fontWeight: 'normal', textAlign: 'center' }}>{t('docs:create_new')}</h2>
        {templateNames.map(template => <div className="column col-4 col-sm-6 col-xs-12" key={template}>
          <TemplateCard>
            <div className="card-image">
              <img className="img-responsive" src={`/schemas-images/${template}.webp`} width={516} height={293} alt={t(`templates:template_${template}`).toString()} />
            </div>
            <div className="card-header">
              <div className="card-title h5">{t(`templates:template_${template}`)}</div>
            </div>
            <p>
              <br />
              <Button className="btn btn-primary" onClick={() => root.documentEditorPage.createNew(template)}>{t('docs:create')}</Button>
            </p>
          </TemplateCard>
        </div>)}
        <div style={{ clear: 'both' }}></div>
      </FixedWidth>
    </PinkLayout>
    <div style={{
      textAlign: 'center',
      color: '#ddd',
      background: '#333333',
      padding: '40px 0',
    }}>
      <a href='mailto:sachik-sergey@yandex.ru' style={{ color: 'white' }}>sachik-sergey@yandex.ru</a>
    </div>
  </ContentLayout>
});
