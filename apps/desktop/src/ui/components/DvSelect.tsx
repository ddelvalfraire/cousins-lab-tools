import { Combobox, ScrollArea, useCombobox } from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react';
import './Approved.css';
import './DvSelect.css';

export interface DvSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Options with the same group are listed together under this heading. */
  group?: string;
}

export interface DvSelectProps extends Omit<ComponentPropsWithRef<'button'>, 'value' | 'onChange' | 'children' | 'type'> {
  value: string;
  options: readonly DvSelectOption[];
  onChange: (value: string) => void;
}

// Matches the native select: a pause this long starts a new type-ahead search.
const TYPE_AHEAD_MS = 500;

/**
 * The one select control. A button that opens a portalled list, so the list is never cut by a scroll container or
 * dialog and never moves the page. Keyboard follows the WAI-ARIA select-only combobox pattern.
 * Label it like a native select: a `<label htmlFor>`, `aria-label` or `aria-labelledby`.
 */
export function DvSelect({ value, options, onChange, className, disabled, onKeyDown, onClick, onBlur, ref, ...rest }: DvSelectProps) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-${index}`;
  const button = useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = useState(-1);
  const [listName, setListName] = useState<string>();
  const combobox = useCombobox({ onDropdownClose: () => setActive(-1) });
  const opened = combobox.dropdownOpened;
  const typed = useRef({ text: '', at: 0 });
  const selectedIndex = options.findIndex(option => option.value === value);
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);

  useEffect(() => {
    if (!opened || active < 0) return;
    // The list mounts in its portal one frame after opening.
    const frame = requestAnimationFrame(() => document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  });

  const openAt = (index: number) => {
    const target = button.current;
    setListName(rest['aria-label'] ?? target?.labels?.[0]?.textContent?.trim() ?? undefined);
    setActive(index);
    combobox.openDropdown('keyboard');
  };
  const current = () => selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : enabled[0] ?? -1;
  const choose = (index: number) => {
    const option = options[index];
    combobox.closeDropdown();
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  };
  const step = (from: number, delta: 1 | -1) => {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) if (!options[i].disabled) return i;
    return from;
  };
  const search = (key: string, timeStamp: number) => {
    const state = typed.current;
    state.text = timeStamp - state.at > TYPE_AHEAD_MS ? key : state.text + key;
    state.at = timeStamp;
    const text = state.text.toLowerCase();
    // Pressing one letter repeatedly cycles through the options that start with it.
    const repeat = [...text].every(char => char === text[0]);
    const from = opened ? active : selectedIndex;
    const start = repeat ? from + 1 : Math.max(from, 0);
    const order = enabled.map(index => (index - start + options.length) % options.length)
      .map((offset, i) => [offset, enabled[i]] as const).sort((a, b) => a[0] - b[0]).map(([, index]) => index);
    return order.find(index => options[index].label.toLowerCase().startsWith(repeat ? text[0] : text)) ?? -1;
  };

  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    const { key } = event;
    const typing = key === ' ' && event.timeStamp - typed.current.at < TYPE_AHEAD_MS && typed.current.text !== '';
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && (key !== ' ' || typing)) {
      event.preventDefault();
      const match = search(key, event.timeStamp);
      if (match < 0) return;
      if (opened) setActive(match); else openAt(match);
      return;
    }
    typed.current.text = '';
    if (!opened) {
      const target = { ArrowDown: current(), ArrowUp: current(), Enter: current(), ' ': current(), Home: enabled[0], End: enabled[enabled.length - 1] }[key];
      if (target === undefined) return;
      event.preventDefault();
      openAt(target);
      return;
    }
    if (key === 'Tab') { choose(active); return; }
    if (key === 'Escape') {
      // Close only the list; a dialog around it stays open.
      event.preventDefault();
      event.stopPropagation();
      combobox.closeDropdown('keyboard');
      return;
    }
    const next: Record<string, () => number | void> = {
      ArrowDown: () => step(active, 1),
      ArrowUp: () => event.altKey ? choose(active) : step(active, -1),
      Home: () => enabled[0],
      End: () => enabled[enabled.length - 1],
      PageDown: () => enabled.filter(index => index <= active + 10).pop() ?? active,
      PageUp: () => enabled.find(index => index >= active - 10) ?? active,
      Enter: () => choose(active),
      ' ': () => choose(active),
    };
    if (!(key in next)) return;
    event.preventDefault();
    const index = next[key]();
    if (typeof index === 'number') setActive(index);
  };

  const selected = options[selectedIndex];
  const groups: { label?: string; items: { option: DvSelectOption; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const last = groups[groups.length - 1];
    if (last && last.label === option.group) last.items.push({ option, index });
    else groups.push({ label: option.group, items: [{ option, index }] });
  });
  const renderOption = ({ option, index }: { option: DvSelectOption; index: number }) =>
    <Combobox.Option key={option.value} value={option.value} id={optionId(index)} className="dv-select-option" disabled={option.disabled}
      active={index === selectedIndex} aria-selected={index === selectedIndex} data-highlighted={index === active || undefined} data-value={option.value}
      onMouseEnter={() => { if (!option.disabled) setActive(index); }}>
      <IconCheck className="dv-select-check" aria-hidden /><span>{option.label}</span>
    </Combobox.Option>;
  const list: ReactNode = groups.map((group, i) => group.label === undefined
    ? group.items.map(renderOption)
    : <Combobox.Group key={`${group.label}-${i}`} label={group.label} classNames={{ groupLabel: 'dv-select-group' }}>{group.items.map(renderOption)}</Combobox.Group>);

  return <Combobox store={combobox} onOptionSubmit={submitted => choose(options.findIndex(option => option.value === submitted))}
    withinPortal zIndex={1000} position="bottom-start" offset={4} width="max-content" transitionProps={{ duration: 0 }}
    middlewares={{ flip: true, shift: { padding: 8 } }} classNames={{ dropdown: 'dvdash dv-select-dropdown' }}>
    <Combobox.Target targetType="button" withAriaAttributes={false} withKeyboardNavigation={false}>
      <button {...rest} ref={node => { button.current = node; if (typeof ref === 'function') return ref(node); if (ref) ref.current = node; }}
        type="button" className={className ? `dv-select ${className}` : 'dv-select'} disabled={disabled} value={value}
        role="combobox" aria-haspopup="listbox" aria-expanded={opened} aria-controls={opened ? listId : undefined}
        aria-activedescendant={opened && active >= 0 ? optionId(active) : undefined} data-mantine-stop-propagation={opened || undefined}
        onKeyDown={keyDown}
        onClick={event => { onClick?.(event); if (event.defaultPrevented) return; if (opened) combobox.closeDropdown('unknown'); else openAt(current()); }}
        onBlur={event => { onBlur?.(event); combobox.closeDropdown('unknown'); }}>
        <span className="dv-select-value">{selected?.label ?? ''}</span>
        <IconChevronDown className="dv-select-chevron" aria-hidden />
      </button>
    </Combobox.Target>
    {/* Keeps focus on the button when the list or its scroll bar is pressed. */}
    <Combobox.Dropdown style={{ minWidth: button.current?.offsetWidth }} onMouseDown={event => event.preventDefault()}>
      {/* Arrow keys move through the list from the button. The scroller is focusable so a long list can still be scrolled
          without the button; Tab closes the list before focus can reach it. */}
      <ScrollArea.Autosize mah="min(320px, 45vh)" type="scroll" scrollbars="y" scrollbarSize={8} viewportProps={{ tabIndex: 0 }}>
        <Combobox.Options id={listId} aria-label={rest['aria-labelledby'] ? undefined : listName} aria-labelledby={rest['aria-labelledby']}>{list}</Combobox.Options>
      </ScrollArea.Autosize>
    </Combobox.Dropdown>
  </Combobox>;
}
