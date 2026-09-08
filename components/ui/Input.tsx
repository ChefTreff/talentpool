import type { ComponentProps } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-ct-md border border-border-strong bg-surface px-3 text-[15px] leading-6 text-ink " +
  "placeholder:text-muted focus:border-accent disabled:bg-surface-hover disabled:text-muted";

export function Input({
  className,
  invalid,
  ...rest
}: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(control, "h-10", invalid && "border-error", className)}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...rest
}: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(control, "min-h-24 py-2", invalid && "border-error", className)}
    />
  );
}
