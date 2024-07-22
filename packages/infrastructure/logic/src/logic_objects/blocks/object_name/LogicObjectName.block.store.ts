import { variableNameRegexp } from '../../../logic/util/variableNameRegexp';
import { TextBlockStore, TTextBlockStoreParams } from '@falang/infrastructure-text';


export class LogicObjectNameBlockStore extends TextBlockStore {

  constructor(params: TTextBlockStoreParams) {
    super(params);
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    const t = this.scheme.frontRoot.lang.t;
    const text = this.text;
    if(!variableNameRegexp.test(text)) {
      returnValue.push(t('logic:wrong_var_name'));
    }
    return returnValue;
  }
}