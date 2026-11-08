import Select from 'antd/es/select/index.js';
import { observer } from 'mobx-react-lite';

export interface IStructTypeSelectOption {
  id: string;
  name?: string;
}

export interface IStructTypeSelectProps {
  /** The picked struct id; `''` = nothing picked yet (the placeholder is shown). */
  value: string;
  onChange: (id: string) => void;
  structTypes: readonly IStructTypeSelectOption[];
  placeholder?: string;
  /** `small` inside the scheme's `ts-table` rows. */
  size?: 'small' | 'middle';
}

interface IStructOption {
  value: string;
  label: string;
}

/** `''` reads as "nothing picked", but antd `Select` needs `undefined` to show the placeholder. */
const emptyToUnset = (value: string): string | undefined => {
  if (value) return value;
};

/** Case-insensitive substring match against the shown name and the id (`telegram/Message`). */
export const matchesStructSearch = (input: string, option?: IStructOption): boolean => {
  if (!option) return false;
  const needle = input.trim().toLowerCase();
  if (needle === '') return true;
  return option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle);
};

/**
 * The struct picker of the type selects: an antd `Select` the user can type into to filter the list by substring
 * (a vendor can bring hundreds of types). A value missing from `structTypes` (filtered out, or deleted) is still
 * shown, as its id.
 */
export const StructTypeSelect = observer((props: IStructTypeSelectProps) => {
  const options: IStructOption[] = props.structTypes.map((s) => ({ value: s.id, label: s.name || s.id }));
  return (
    <Select
      size={props.size}
      style={{ width: '100%' }}
      value={emptyToUnset(props.value)}
      onChange={(id: string | undefined) => props.onChange(id ?? '')}
      options={options}
      placeholder={props.placeholder ?? '—'}
      popupMatchSelectWidth={false}
      showSearch={{ filterOption: matchesStructSearch }}
    />
  );
});
