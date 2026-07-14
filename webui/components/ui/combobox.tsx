'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button, ButtonArrow } from '@/components/ui/button';
import {
  Command,
  CommandCheck,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type ComboboxOption = { value: string; label: string };

/**
 * A drop-in replacement for a native <select>: an input-styled trigger that
 * opens a searchable Command list. Search is auto-shown for longer lists and
 * can be forced on/off with `searchable`.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results.',
  searchable,
  disabled,
  className,
  contentClassName,
  ariaLabel,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  const showSearch = searchable ?? options.length > 8;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          mode="input"
          placeholder={!selected}
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={className}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ButtonArrow />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn('w-(--radix-popper-anchor-width) p-0', contentClassName)}
      >
        <Command>
          {showSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  // value drives cmdk's search — use the label so typing matches
                  // the visible text; the real value is read from closure below.
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {value === option.value && <CommandCheck />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
