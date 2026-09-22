import { Check, ChevronDown, Search } from 'lucide-react';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { usePropertySelect } from './usePropertySelect.ts';
import './property-select.css';

export type PropertySelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

type PropertySelectProps = {
  label: string;
  value: string;
  options: PropertySelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
};

export function PropertySelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  required = false,
}: PropertySelectProps) {
  const picker = usePropertySelect({ value, options, onChange, disabled });
  const displayLabel = (picker.selectedOption?.label ?? value) || 'Select';
  return (
    <div className="property-select" ref={picker.rootRef}>
      <PropertySelectTrigger
        ref={picker.triggerRef}
        label={label}
        displayLabel={displayLabel}
        icon={picker.selectedOption?.icon}
        isOpen={picker.isOpen}
        listboxId={picker.listboxId}
        required={required}
        disabled={disabled}
        onClick={() => {
          if (picker.isOpen) picker.closePicker(false);
          else picker.openPicker();
        }}
      />
      {picker.isOpen ? (
        <PropertySelectPopup
          label={label}
          query={picker.query}
          setQuery={picker.setQuery}
          inputRef={picker.inputRef}
          listboxId={picker.listboxId}
          highlightedOption={picker.highlightedOption}
          filteredOptions={picker.filteredOptions}
          selectedValue={value}
          optionId={(option) =>
            `${picker.id}-option-${options.indexOf(option)}`
          }
          onKeyDown={picker.handleSearchKeyDown}
          onMouseEnter={(option) =>
            picker.setHighlightedIndex(picker.filteredOptions.indexOf(option))
          }
          onChoose={picker.chooseOption}
        />
      ) : null}
    </div>
  );
}

type PropertySelectTriggerProps = {
  label: string;
  displayLabel: string;
  icon?: ReactNode;
  isOpen: boolean;
  listboxId: string;
  required: boolean;
  disabled: boolean;
  onClick: () => void;
};

function PropertySelectTrigger({
  label,
  displayLabel,
  icon,
  isOpen,
  listboxId,
  required,
  disabled,
  onClick,
  ref,
}: PropertySelectTriggerProps & { ref: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      className="property-select-trigger"
      type="button"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? (
        <span className="property-select-trigger-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="property-select-trigger-label">{displayLabel}</span>
      <ChevronDown
        className="property-select-chevron"
        size={13}
        aria-hidden="true"
      />
    </button>
  );
}

type PropertySelectPopupProps = {
  label: string;
  query: string;
  setQuery: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listboxId: string;
  highlightedOption: PropertySelectOption | undefined;
  filteredOptions: PropertySelectOption[];
  selectedValue: string;
  optionId: (option: PropertySelectOption) => string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onMouseEnter: (option: PropertySelectOption) => void;
  onChoose: (option: PropertySelectOption) => void;
};

function PropertySelectPopup({
  label,
  query,
  setQuery,
  inputRef,
  listboxId,
  highlightedOption,
  filteredOptions,
  selectedValue,
  optionId,
  onKeyDown,
  onMouseEnter,
  onChoose,
}: PropertySelectPopupProps) {
  return (
    <div className="property-select-popup">
      <div className="property-select-search">
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={`Search ${label}`}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded="true"
          aria-activedescendant={
            highlightedOption ? optionId(highlightedOption) : undefined
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Search ${label.toLocaleLowerCase()}`}
        />
      </div>
      <PropertySelectOptions
        label={label}
        listboxId={listboxId}
        highlightedOption={highlightedOption}
        filteredOptions={filteredOptions}
        selectedValue={selectedValue}
        optionId={optionId}
        onMouseEnter={onMouseEnter}
        onChoose={onChoose}
      />
    </div>
  );
}

type PropertySelectOptionsProps = Pick<
  PropertySelectPopupProps,
  | 'label'
  | 'listboxId'
  | 'highlightedOption'
  | 'filteredOptions'
  | 'selectedValue'
  | 'optionId'
  | 'onMouseEnter'
  | 'onChoose'
>;

function PropertySelectOptions({
  label,
  listboxId,
  highlightedOption,
  filteredOptions,
  selectedValue,
  optionId,
  onMouseEnter,
  onChoose,
}: PropertySelectOptionsProps) {
  return (
    <ul
      id={listboxId}
      className="property-select-options"
      role="listbox"
      aria-label={label}
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.map((option) => (
          <PropertySelectOption
            key={option.value}
            option={option}
            optionId={optionId(option)}
            isSelected={option.value === selectedValue}
            isHighlighted={option === highlightedOption}
            onMouseEnter={() => onMouseEnter(option)}
            onChoose={() => onChoose(option)}
          />
        ))
      ) : (
        <li className="property-select-empty" role="status">
          No matching {label.toLocaleLowerCase()}
        </li>
      )}
    </ul>
  );
}

function PropertySelectOption({
  option,
  optionId,
  isSelected,
  isHighlighted,
  onMouseEnter,
  onChoose,
}: {
  option: PropertySelectOption;
  optionId: string;
  isSelected: boolean;
  isHighlighted: boolean;
  onMouseEnter: () => void;
  onChoose: () => void;
}) {
  return (
    <li
      id={optionId}
      className={`property-select-option${isHighlighted ? ' is-highlighted' : ''}`}
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onMouseEnter}
      onClick={onChoose}
    >
      {option.icon ? (
        <span className="property-select-option-icon" aria-hidden="true">
          {option.icon}
        </span>
      ) : null}
      <span className="property-select-option-label">{option.label}</span>
      {isSelected ? (
        <Check
          className="property-select-option-check"
          size={14}
          aria-hidden="true"
        />
      ) : null}
    </li>
  );
}
