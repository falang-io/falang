import { TextInfrastructureType } from '../infrastructure/text/TextInfrastructureType';
import { SchemeStore } from '../store/Scheme.store';
import { fakeFrontRoot } from './fakeFrontRoot';

describe('Test scheme DTO', () => {
  it('Empty function DTO', () => {
    const textType = new TextInfrastructureType();
    const scheme = new SchemeStore(fakeFrontRoot, textType, '');
    //const a = textType.config.icons.action.
    expect(1).toEqual(1);
  });
});

export {};