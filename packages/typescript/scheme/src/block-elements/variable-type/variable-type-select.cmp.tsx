// oxlint-disable complexity, no-nested-ternary, no-undefined, no-useless-undefined, consistent-function-scoping -- one picker with many optional rows
import type { TNumberTypeDetail, TTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import Select from 'antd/es/select/index.js';
import FormItem from 'antd/es/form/FormItem/index.js';
import InputNumber from 'antd/es/input-number/index.js';
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { TsSelect } from '../../cmp/ts-select.js';
import type {
  TNumberTypesMode,
  TypescriptProjectService,
} from '../../typescript-project-service/typescript-project.service.js';
import {
  FLOAT_WIDTHS,
  INTEGER_WIDTHS,
  DECIMAL_MAX_DIGITS,
  buildDefaultVariableType,
  choiceOf,
  clampDecimalDecimals,
  clampDecimalDigits,
  getTypeChoices,
  type TTypeChoice,
} from './variable-type-model.js';
import { useTypeLabel } from './use-type-labels.js';

const dimensionsOptions = [1, 2, 3, 4] as const;

export interface IStructTypeOption {
  id: string;
  name?: string;
}

export interface IVariableTypeSelectProps {
  /** `undefined` = no value (a missing return type, shown as `void`, or as `none` with `allowNone`). */
  value: TVariableInfo | undefined;
  /** Gets `undefined` when `void` (default) or `none` is picked on a field that may be absent. */
  onChange: (next: TVariableInfo | undefined) => void;
  projectService: Pick<TypescriptProjectService, 'numberTypesMode' | 'defaultFloatType'> | null;
  structTypes: readonly IStructTypeOption[];
  /** `table`: `ts-table` rows (the block editors); `form`: antd form items (the sidebar editors). */
  variant: 'table' | 'form';
  /** Label of the main select (`type`, `returns`, `Type`, `Return type`). Default: `type` / `Type`. */
  label?: string;
  /** `colSpan` of the control cell in `table` rows (the label cell is always one column). */
  colSpan?: number;
  allowVoid?: boolean;
  allowEnum?: boolean;
  /** Offer a leading `none`: picking it emits `undefined`. */
  allowNone?: boolean;
  /** `void` is stored as no value at all (function return types). */
  voidIsUndefined?: boolean;
  /** Last row has no bottom margin in `form`. */
  lastInForm?: boolean;
}

const setNumberDetail = (type: TTypeInfo, numberType: TNumberTypeDetail): TTypeInfo =>
  type.type === 'number' ? { ...type, numberType } : type;

/**
 * The one type picker of the TypeScript scheme blocks (create-var, function parameters and return type, object
 * properties, external API items). In `portable` number mode (ADR 0069) `number` is replaced by
 * `integer`/`float`/`decimal` with a width / digits / decimals control, and `any` / `enum` are not offered.
 */
export const VariableTypeSelect = observer((props: IVariableTypeSelectProps) => {
  const tr = useTypeLabel();
  const mode: TNumberTypesMode = props.projectService?.numberTypesMode ?? 'typescript';
  const { variant, value, structTypes } = props;
  const table = variant === 'table';

  const emit = (next: TVariableInfo | undefined) => props.onChange(next);

  const rows: ReactNode[] = [];

  const row = (key: string, label: string, control: ReactNode, last = false) => {
    rows.push(
      table ? (
        <tr key={key}>
          <td>
            <div className="ts-label">{label}</div>
          </td>
          <td colSpan={props.colSpan}>{control}</td>
        </tr>
      ) : (
        <FormItem key={key} label={label} style={{ marginBottom: last ? 0 : 8 }}>
          {control}
        </FormItem>
      ),
    );
  };

  const selectControl = (
    selected: string | number,
    options: { value: string | number; label: string; disabled?: boolean }[],
    onPick: (picked: string) => void,
  ) =>
    table ? (
      <TsSelect value={selected} onChange={(e) => onPick(e.currentTarget.value)} style={{ width: '100%' }}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </TsSelect>
    ) : (
      <Select value={selected} onChange={(v) => onPick(String(v))} style={{ width: '100%' }}>
        {options.map((o) => (
          <Select.Option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </Select.Option>
        ))}
      </Select>
    );

  const numberControl = (current: number, min: number, max: number, onPick: (n: number) => void) =>
    table ? (
      <input
        className="ts-input"
        type="number"
        min={min}
        max={max}
        value={current}
        onChange={(e) => onPick(e.currentTarget.valueAsNumber)}
      />
    ) : (
      <InputNumber
        min={min}
        max={max}
        value={current}
        onChange={(v) => onPick(typeof v === 'number' ? v : min)}
        style={{ width: '100%' }}
      />
    );

  /** Rows for one level: the main select, then whatever its choice needs. */
  const renderLevel = (
    type: TTypeInfo | undefined,
    onType: (next: TTypeInfo | undefined) => void,
    isElement: boolean,
    last: boolean,
  ) => {
    const prefix = isElement ? 'el-' : '';
    const choice: TTypeChoice = type ? choiceOf(type, mode) : props.allowNone && !isElement ? 'none' : 'void';
    const choices = getTypeChoices({
      mode,
      isElement,
      allowVoid: props.allowVoid ?? true,
      allowEnum: props.allowEnum ?? true,
      allowNone: !isElement && props.allowNone,
    });
    // Existing values the mode no longer offers stay visible instead of being silently replaced.
    const shown: TTypeChoice[] = choices.includes(choice) ? choices : [choice, ...choices];
    const labelFor = (c: TTypeChoice): string => (c === '' ? '—' : c);
    const mainLabel = isElement
      ? table
        ? tr('of', 'of')
        : tr('element-type', 'Element type')
      : (props.label ?? (table ? tr('type', 'type') : tr('type-form', 'Type')));
    const needsMore = (type?.type === 'array' && !isElement) || type?.type === 'struct' || type?.type === 'number';
    row(
      `${prefix}type`,
      mainLabel,
      selectControl(
        choice,
        shown.map((c) => ({ value: c, label: labelFor(c), disabled: c === '' })),
        (picked) => {
          const next = picked as TTypeChoice;
          if (next === 'none') return onType(undefined);
          if (next === 'void' && props.voidIsUndefined && !isElement) return onType(undefined);
          return onType(buildDefaultVariableType(next, props.projectService));
        },
      ),
      last && !needsMore,
    );
    if (type?.type === 'number') {
      const detail = type.numberType;
      if (detail.type === 'integer') {
        row(
          `${prefix}width`,
          tr('width', 'width'),
          selectControl(
            detail.integerType,
            INTEGER_WIDTHS.map((w) => ({ value: w, label: w })),
            (w) => onType(setNumberDetail(type, { type: 'integer', integerType: w as typeof detail.integerType })),
          ),
          last,
        );
      } else if (detail.type === 'float') {
        row(
          `${prefix}width`,
          tr('width', 'width'),
          selectControl(
            detail.floatType,
            FLOAT_WIDTHS.map((w) => ({ value: w, label: w })),
            (w) => onType(setNumberDetail(type, { type: 'float', floatType: w as typeof detail.floatType })),
          ),
          last,
        );
      } else if (detail.type === 'decimal') {
        row(
          `${prefix}digits`,
          tr('digits', 'digits'),
          numberControl(detail.digits, 1, DECIMAL_MAX_DIGITS, (n) => {
            const digits = clampDecimalDigits(n);
            onType(
              setNumberDetail(type, {
                type: 'decimal',
                digits,
                decimals: clampDecimalDecimals(detail.decimals, digits),
              }),
            );
          }),
        );
        row(
          `${prefix}decimals`,
          tr('decimals', 'decimals'),
          numberControl(detail.decimals, 0, detail.digits, (n) =>
            onType(
              setNumberDetail(type, {
                type: 'decimal',
                digits: detail.digits,
                decimals: clampDecimalDecimals(n, detail.digits),
              }),
            ),
          ),
          last,
        );
      }
    }
    if (type?.type === 'struct') {
      row(
        `${prefix}struct`,
        isElement && !table ? tr('element-struct', 'Element struct') : tr('struct', table ? 'struct' : 'Struct'),
        selectControl(
          type.id,
          [{ value: '', label: '—' }, ...structTypes.map((s) => ({ value: s.id, label: s.name || s.id }))],
          (id) => onType({ type: 'struct', id }),
        ),
        last,
      );
    }
    if (type?.type === 'array' && !isElement) {
      const array = type;
      renderLevel(array.elementType, (el) => onType({ ...array, elementType: el ?? array.elementType }), true, false);
      row(
        'dim',
        table ? tr('dim', 'dim') : tr('dimensions', 'Dimensions'),
        selectControl(
          array.dimensions,
          dimensionsOptions.map((d) => ({ value: d, label: String(d) })),
          (d) => onType({ ...array, dimensions: Number(d) }),
        ),
        last,
      );
    }
  };

  renderLevel(value, (next) => emit(next as TVariableInfo | undefined), false, props.lastInForm ?? false);

  return <>{rows}</>;
});
