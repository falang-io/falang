import { TLanguage } from '@falang/i18n';
import { IAppConfig } from '@falang/project';
import { AppState } from './AppState';

export class AppConfigService {
  private currentWritePromise: Promise<void> | null = null;
  constructor(readonly app: AppState) { }
  lang: string = 'en'

  async readConfig(): Promise<IAppConfig> {
    const returnValue = await this.app.mainApi.fs.readConfig()
    this.lang = returnValue.language ?? 'en';
    return returnValue;
  }

  writeConfig(config: IAppConfig): Promise<void> {
    if(!this.currentWritePromise) {
      this.currentWritePromise = this.writeConfigPrivate(config);
    } else {
      const prevPromise = this.currentWritePromise;
      const myPromise = new Promise<void>(async (resolve, reject) => {
        try {
          await prevPromise;
          if(this.currentWritePromise === myPromise) {
            this.currentWritePromise = null;
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      this.currentWritePromise = myPromise;
    }
    return this.currentWritePromise;
  }

  private async writeConfigPrivate(config: IAppConfig) {
    const currentConfig = await this.readConfig();
    const newConfig: IAppConfig = {
      ...currentConfig,
      ...config,
    };
    await this.app.mainApi.fs.writeConfig(newConfig);
  }

  async setLang(language: TLanguage) {
    await this.writeConfig({
      language,
    });
    this.lang = language;
    this.app.mainApi.methods.setLang(language);
  }
}