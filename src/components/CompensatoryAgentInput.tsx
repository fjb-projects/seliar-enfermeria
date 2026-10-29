import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

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

  useEffect(() => {
    if (selectedOption) setQuery(selectedOption.label);
  }, [selectedOption]);

  const exactMatch = resolveExactAgentOption(options, query);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        list={`${id}-options`}
        className="min-h-11 w-full"
        value={query}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => {
          const next = event.currentTarget.value;
          setQuery(next);
          onSelect(resolveExactAgentOption(options, next) ?? null);
        }}
      />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>
      {query && !exactMatch && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Selecciona una opción completa que incluya el DNI.
        </p>
      )}
    </div>
  );
}
