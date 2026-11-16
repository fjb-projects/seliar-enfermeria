import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type AgentOption = { id: string; label: string };

function resolveExactAgentOption(options: AgentOption[], label: string) {
  const matches = options.filter((option) => option.label === label);
  return matches.length === 1 ? matches[0]?.id : undefined;
}

export function CompensatoryAgentInput({
  id,
  label,
  value,
  options,
  disabled,
  onSelect,
}: {
  id: string;
  label: string;
  value: string;
  options: AgentOption[];
  disabled?: boolean;
  onSelect: (id: string | null) => void;
}) {
  const selectedOption = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const normalize = (text: string) =>
    text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const visibleOptions = filtering
    ? options.filter((option) => normalize(option.label).includes(normalize(query)))
    : options;
  const activeOption = visibleOptions[activeIndex];
  const selectedLabel = selectedOption?.label;

  useEffect(() => {
    if (selectedLabel) setQuery(selectedLabel);
  }, [selectedLabel]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open && activeIndex >= 0)
      document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);

  function choose(option: AgentOption) {
    if (disabled || resolveExactAgentOption(options, option.label) !== option.id) return;
    setQuery(option.label);
    setFiltering(false);
    onSelect(option.id);
    inputRef.current?.focus();
    setOpen(false);
    setActiveIndex(-1);
  }

  function showAll() {
    setFiltering(false);
    setActiveIndex(-1);
    setOpen(true);
  }

  const exactMatch = resolveExactAgentOption(options, query);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div ref={anchorRef} className="relative">
            <Input
              ref={inputRef}
              id={id}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open && !disabled}
              aria-controls={`${id}-options`}
              aria-activedescendant={
                open && activeOption ? `${id}-option-${activeIndex}` : undefined
              }
              className="min-h-11 w-full pr-12"
              value={query}
              disabled={disabled}
              autoComplete="off"
              onFocus={(event) => {
                showAll();
                event.currentTarget.select();
              }}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setQuery(next);
                setFiltering(true);
                setActiveIndex(-1);
                setOpen(true);
                onSelect(resolveExactAgentOption(options, next) ?? null);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  setOpen(false);
                  setActiveIndex(-1);
                  return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (!open) {
                    showAll();
                    setActiveIndex(
                      event.key === "ArrowDown" ? (options.length ? 0 : -1) : options.length - 1,
                    );
                    return;
                  }
                  setActiveIndex((index) =>
                    visibleOptions.length
                      ? index < 0
                        ? event.key === "ArrowDown"
                          ? 0
                          : visibleOptions.length - 1
                        : (index + (event.key === "ArrowDown" ? 1 : -1) + visibleOptions.length) %
                          visibleOptions.length
                      : -1,
                  );
                } else if (event.key === "Enter" && open) {
                  event.preventDefault();
                  const choice = activeOption ?? options.find((option) => option.id === exactMatch);
                  if (choice) choose(choice);
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 min-h-11 w-11"
              aria-label={`Mostrar opciones de ${label}`}
              aria-expanded={open && !disabled}
              disabled={disabled}
              onClick={() => {
                if (open) setOpen(false);
                else {
                  showAll();
                  inputRef.current?.focus();
                }
              }}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          role="presentation"
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && anchorRef.current?.contains(event.target))
              event.preventDefault();
          }}
        >
          <div
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className="max-h-64 overflow-y-auto"
          >
            {visibleOptions.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
                No se encontraron agentes.
              </p>
            )}
            {visibleOptions.map((option, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-option-${index}`}
                key={option.id}
                tabIndex={-1}
                aria-selected={value === option.id}
                disabled={resolveExactAgentOption(options, option.label) !== option.id}
                className={`flex min-h-11 w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeIndex === index ? "bg-accent text-accent-foreground" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {query && !exactMatch && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Selecciona una opción completa que incluya el DNI.
        </p>
      )}
    </div>
  );
}
