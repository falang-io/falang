import { action, makeObservable, observable, runInAction } from 'mobx';
import { TLanguage, getLang, i18next } from '@falang/i18n';
import * as moment from 'moment';
import 'moment/locale/ru' ;
import 'moment/locale/en-gb'

const LOCAL_STORAGE_KEY = 'lang';

export type TLangFunction = (key: string) => string;

export class LangState {
  @observable lang = 'en';
  @observable t: TLangFunction = ((key) => key);

  constructor() {
    makeObservable(this);
    if(globalThis.localStorage) {
      const localStorageValue = localStorage.getItem(LOCAL_STORAGE_KEY) as TLanguage;
      this.setLang(localStorageValue || 'en');
    }

  }

  @action setLang(lang: TLanguage) {
    if(globalThis.localStorage) localStorage.setItem(LOCAL_STORAGE_KEY, lang);
    this.lang = lang;
    i18next.changeLanguage(lang as any);
    this.t = getLang(lang as any).t;
    moment.locale(lang === 'ru' ? 'ru' : 'en-gb')
  }

  @action toggleLang() {
    this.setLang(this.lang === 'en' ? 'ru' : 'en');
  }
}