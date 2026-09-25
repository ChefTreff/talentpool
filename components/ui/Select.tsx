import type { ComponentProps } from "react";
import { cn, feldBreite } from "./cn";

export type SelectOption = { value: string; label: string };

export function Select({
  options,
  placeholder,
  className,
  invalid,
  ...rest
}: ComponentProps<"select"> & {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 rounded-ct-md border border-border-strong bg-surface px-3 leading-6 text-ink",
        feldBreite(className),
        "focus:border-accent disabled:bg-surface-hover disabled:text-muted",
        invalid && "border-error",
        className,
      )}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
