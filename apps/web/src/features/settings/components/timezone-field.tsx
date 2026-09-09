"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { ianaTimeZone } from "@momentum/core/time";
import type { IanaTimeZone } from "@momentum/core/types";
import { Button } from "@momentum/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@momentum/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@momentum/ui/components/popover";

import { timeZoneOptions } from "@/features/settings/timezones";

/**
 * A searchable list of every IANA zone: the command primitive inside a
 * popover. While the write is in flight the trigger is `aria-disabled` rather
 * than natively disabled: the browser blurs a control the moment it is
 * disabled, and this one is focused when the write starts.
 */
export function TimezoneField({
  id,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  value: IanaTimeZone;
  disabled: boolean;
  onCommit: (zone: IanaTimeZone) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const zones = React.useMemo(() => timeZoneOptions(value), [value]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && disabled) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-disabled={disabled || undefined}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value}</span>
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command label="Search timezones">
          <CommandInput placeholder="Search timezones" />
          <CommandList>
            <CommandEmpty>No timezone matches.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  data-checked={zone === value || undefined}
                  onSelect={() => {
                    setOpen(false);
                    if (zone !== value) onCommit(ianaTimeZone(zone));
                  }}
                >
                  {zone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
