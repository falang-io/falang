import type React from 'react';
import { useState } from 'react';
import { Cron, type CronError, type Locale as TCronLocale, type PeriodType, type ShortcutsType } from 'react-js-cron';
import 'react-js-cron/styles.css';

/**
 * `react-js-cron@6.0.2` declares `antd: >=6.0.0` in its own `peerDependencies` and installed cleanly
 * against this repo's `antd@^6.3.7` (`npm install`, no `--legacy-peer-deps` needed) — see
 * ADR 0037 (private) §2 for why this was picked over a hand-rolled builder.
 * The library ships no built-in Russian translation (only a `locale` prop shape, `Locale`), so
 * `RU_CRON_LOCALE` below is a hand-translated copy of its own English default (there is no exported
 * runtime default to extend — only the `Locale` *type* is exported — so this was built from the
 * library's minified source, `dist/index.mjs`'s own default-locale object literal).
 */
const RU_CRON_LOCALE: TCronLocale = {
  everyText: 'каждые',
  emptyMonths: 'каждый месяц',
  emptyMonthDays: 'каждый день месяца',
  emptyMonthDaysShort: 'день месяца',
  emptyWeekDays: 'каждый день недели',
  emptyWeekDaysShort: 'день недели',
  emptyHours: 'каждый час',
  emptyMinutes: 'каждую минуту',
  emptyMinutesForHourPeriod: 'каждые',
  yearOption: 'год',
  monthOption: 'месяц',
  weekOption: 'неделя',
  dayOption: 'день',
  hourOption: 'час',
  minuteOption: 'минута',
  rebootOption: 'перезагрузка',
  prefixPeriod: 'Каждые',
  prefixMonths: 'в',
  prefixMonthDays: 'числа',
  prefixWeekDays: 'по',
  prefixWeekDaysForMonthAndYearPeriod: 'и',
  prefixHours: 'в',
  prefixMinutes: ':',
  prefixMinutesForHourPeriod: 'в',
  suffixMinutesForHourPeriod: 'минут(ы)',
  errorInvalidCron: 'Некорректное cron-выражение',
  clearButtonText: 'Очистить',
  weekDays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  months: [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ],
  altWeekDays: ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'],
  altMonths: ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'],
};

/** `'year'`/`'reboot'` dropped: the vendor's `expression` field is always validated as a plain 5-field cron (`validateScheduleCronExpression`), and `@reboot` isn't one — offering "reboot" would let a user pick a preset the form then immediately rejects. */
const ALLOWED_PERIODS: PeriodType[] = ['month', 'week', 'day', 'hour', 'minute'];
/** Same reasoning — `@reboot` dropped from the quick-preset shortcut buttons too. */
const ALLOWED_SHORTCUTS: ShortcutsType[] = ['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@hourly'];

export interface CronBuilderFieldProps {
  /** antd `Form.Item`'s controlled value — the raw 5-field cron expression; this is the source of truth (ADR 0037 (private) §2), `Cron`'s own internal parse state never overrides it. */
  value?: string;
  onChange?: (value: string) => void;
  /** Current UI language (`I18NStore.language`) — only `'ru'` gets `RU_CRON_LOCALE`, anything else keeps the library's own English default. */
  language: string;
  /** Shown under the builder while the current `value` can't be represented by it (hand-typed/complex) — informational only, the text field is untouched either way. */
  customHint?: string;
}

/**
 * Two-way cron builder for `schedule-cron`'s `expression` context field, rendered inside
 * `NewTriggerModal`'s generic `contextFields` loop in place of the plain text `Input` for that one
 * field. Wraps `react-js-cron`'s `<Cron>` behind antd `Form.Item`'s own `value`/`onChange` contract, so
 * typing in the (still separately rendered, see `NewTriggerModal`) raw expression text and picking from
 * this builder both funnel through the same form field — the text field stays authoritative: an
 * expression the builder can't parse just leaves `Cron` in its own internal "invalid" state
 * (`onError` fires, see `customHint`) without ever touching or clearing the form value.
 */
export const CronBuilderField: React.FC<CronBuilderFieldProps> = ({ value, onChange, language, customHint }) => {
  const [isCustom, setIsCustom] = useState(false);

  return (
    <div className="cron-builder-field">
      <Cron
        value={value ?? ''}
        setValue={(next: string) => onChange?.(next)}
        onError={(error: CronError) => setIsCustom(Boolean(error))}
        {...(language === 'ru' ? { locale: RU_CRON_LOCALE } : {})}
        allowedPeriods={ALLOWED_PERIODS}
        shortcuts={ALLOWED_SHORTCUTS}
        allowEmpty="never"
        clearButton={false}
      />
      {isCustom && customHint ? <div className="cron-builder-field__custom-hint">{customHint}</div> : null}
    </div>
  );
};
