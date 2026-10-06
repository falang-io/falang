import { describe, expect, it } from 'vitest';
import { DriverConfigValidationError, parseDriverConfig } from './driver-config.js';
import { localizeDriverConfig } from './driver-localize.js';

const base = () => ({
  id: 'lcd',
  label: 'LCD',
  includes: ['lcd.h'],
  sourceFiles: ['lcd.h', 'lcd.cpp'],
  declarations: ['declare function lcd_print(row: number): void;', 'declare function lcd_init(address: number): void;'],
  actions: [
    {
      id: 'print',
      label: 'Print',
      fields: [
        {
          name: 'row',
          label: 'Row',
          kind: 'select',
          default: '0',
          options: [
            { value: '0', label: 'Row 1' },
            { value: '1', label: 'Row 2' },
          ],
        },
      ],
      codeTemplate: 'lcd_print(${row})',
    },
  ],
  device: {
    fields: [{ name: 'address', label: 'Address', kind: 'number', default: '39' }],
    setupTemplate: 'lcd_init(${address})',
  },
});

const withLocales = (locales: unknown) => ({ ...base(), locales });

const ru = {
  ru: {
    label: 'Дисплей',
    actions: { print: { label: 'Печать', fields: { row: { label: 'Строка', options: { '1': 'Строка 2' } } } } },
    device: { fields: { address: { label: 'Адрес' } } },
  },
};

describe('driver locales', () => {
  it('accepts a valid locales section', () => {
    expect(parseDriverConfig(withLocales(ru)).locales?.ru?.label).toBe('Дисплей');
  });

  it('rejects an unknown action id', () => {
    expect(() => parseDriverConfig(withLocales({ ru: { actions: { nope: { label: 'x' } } } }))).toThrow(
      DriverConfigValidationError,
    );
  });

  it('rejects an unknown field name and an unknown option value', () => {
    expect(() =>
      parseDriverConfig(withLocales({ ru: { actions: { print: { fields: { zzz: { label: 'x' } } } } } })),
    ).toThrow(/unknown field "zzz"/);
    expect(() =>
      parseDriverConfig(withLocales({ ru: { actions: { print: { fields: { row: { options: { '9': 'x' } } } } } } })),
    ).toThrow(/no option "9"/);
  });

  it('rejects a device locale for a driver without a device section and unknown device fields', () => {
    const { device: _device, ...baseWithoutDevice } = base();
    const noDevice = { ...baseWithoutDevice, locales: { ru: { device: { fields: {} } } } };
    expect(() => parseDriverConfig(noDevice)).toThrow(/no "device" section/);
    expect(() => parseDriverConfig(withLocales({ ru: { device: { fields: { x: { label: 'y' } } } } }))).toThrow(
      /unknown field "x"/,
    );
  });

  it('rejects a malformed language code', () => {
    expect(() => parseDriverConfig(withLocales({ Русский: {} }))).toThrow(DriverConfigValidationError);
  });
});

describe('localizeDriverConfig', () => {
  const config = parseDriverConfig(withLocales(ru));

  it('overlays labels for the language and its base language', () => {
    for (const language of ['ru', 'ru-RU']) {
      const localized = localizeDriverConfig(config, language);
      expect(localized.label).toBe('Дисплей');
      expect(localized.actions[0]?.label).toBe('Печать');
      const row = localized.actions[0]?.fields[0];
      expect(row?.label).toBe('Строка');
      expect(row?.options?.map((option) => option.label)).toEqual(['Row 1', 'Строка 2']);
      expect(localized.device?.fields[0]?.label).toBe('Адрес');
    }
  });

  it('keeps templates and ids, and returns the config itself for an untranslated language', () => {
    expect(localizeDriverConfig(config, 'ru').actions[0]?.codeTemplate).toBe('lcd_print(${row})');
    expect(localizeDriverConfig(config, 'en')).toBe(config);
  });
});
