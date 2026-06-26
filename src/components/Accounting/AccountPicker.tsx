import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChartOfAccount } from "@/types/accounting";

export function AccountPicker({ accounts, value, onChange, placeholder }: {
  accounts: ChartOfAccount[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
          {selected
            ? <span>{selected.code} — {selected.name}</span>
            : <span className="text-muted-foreground">{placeholder ?? "Select account…"}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            {["expense", "asset", "liability", "income", "equity"].map(type => {
              const group = accounts.filter(a => a.type === type);
              if (!group.length) return null;
              return (
                <CommandGroup key={type} heading={type.charAt(0).toUpperCase() + type.slice(1)}>
                  {group.map(a => (
                    <CommandItem key={a.id} value={`${a.code} ${a.name}`}
                      onSelect={() => { onChange(a.id); setOpen(false); }}>
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{a.code}</span>
                      {a.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
