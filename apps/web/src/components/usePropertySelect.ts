import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { PropertySelectOption } from './PropertySelect.tsx';

type UsePropertySelectArgs = {
  value: string;
  options: PropertySelectOption[];
  onChange: (value: string) => void;
  disabled: boolean;
};

export function usePropertySelect({
  value,
  options,
  onChange,
  disabled,
}: UsePropertySelectArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId().replaceAll(':', '');
  const listboxId = `${id}-options`;
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const filteredOptions = useFilteredOptions(options, query);
  const highlightedOption = filteredOptions[highlightedIndex];
  usePropertySelectEffects({
    disabled,
    isOpen,
    inputRef,
    filteredOptions,
    query,
    value,
    setIsOpen,
    setQuery,
    setHighlightedIndex,
  });
  useCloseWhenOutside(isOpen, rootRef, () => resetPicker(setIsOpen, setQuery));

  function closePicker(restoreFocus: boolean) {
    setIsOpen(false);
    setQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  }

  function openPicker() {
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setQuery('');
    setIsOpen(true);
  }

  function chooseOption(option: PropertySelectOption) {
    onChange(option.value);
    closePicker(true);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    handlePickerKeyDown(
      event,
      highlightedOption,
      chooseOption,
      closePicker,
      (direction) =>
        setHighlightedIndex((index) =>
          nextHighlight(index, direction, filteredOptions.length),
        ),
    );
  }

  return {
    isOpen,
    query,
    setQuery,
    setHighlightedIndex,
    selectedOption,
    filteredOptions,
    highlightedOption,
    rootRef,
    triggerRef,
    inputRef,
    id,
    listboxId,
    openPicker,
    closePicker,
    chooseOption,
    handleSearchKeyDown,
  };
}

function usePropertySelectEffects({
  disabled,
  isOpen,
  inputRef,
  filteredOptions,
  query,
  value,
  setIsOpen,
  setQuery,
  setHighlightedIndex,
}: {
  disabled: boolean;
  isOpen: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  filteredOptions: PropertySelectOption[];
  query: string;
  value: string;
  setIsOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  setHighlightedIndex: (index: number) => void;
}) {
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [inputRef, isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = filteredOptions.findIndex(
      (option) => option.value === value,
    );
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions.length, isOpen, query, setHighlightedIndex, value]);
  useEffect(() => {
    if (disabled && isOpen) {
      resetPicker(setIsOpen, setQuery);
    }
  }, [disabled, isOpen, setIsOpen, setQuery]);
}

function resetPicker(
  setIsOpen: (open: boolean) => void,
  setQuery: (query: string) => void,
) {
  setIsOpen(false);
  setQuery('');
}

function filterOptions(
  options: PropertySelectOption[],
  query: string,
): PropertySelectOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;
  return options.filter((option) =>
    option.label.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function useFilteredOptions(
  options: PropertySelectOption[],
  query: string,
): PropertySelectOption[] {
  return useMemo(() => filterOptions(options, query), [options, query]);
}

function nextHighlight(index: number, direction: 1 | -1, length: number) {
  if (length === 0) return 0;
  const nextIndex = index + direction;
  if (nextIndex < 0) return length - 1;
  return nextIndex % length;
}

function handlePickerKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  highlightedOption: PropertySelectOption | undefined,
  chooseOption: (option: PropertySelectOption) => void,
  closePicker: (restoreFocus: boolean) => void,
  moveHighlight: (direction: 1 | -1) => void,
) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (highlightedOption) {
      chooseOption(highlightedOption);
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closePicker(true);
    return;
  }
  if (event.key === 'Tab') closePicker(false);
}

function useCloseWhenOutside(
  isOpen: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    function closeWhenOutside(event: PointerEvent | FocusEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        close();
      }
    }
    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('focusin', closeWhenOutside);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('focusin', closeWhenOutside);
    };
  }, [close, isOpen, rootRef]);
}
