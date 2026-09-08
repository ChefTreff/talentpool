import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "sm";

/**
 * Portal-Form: 8-px-Rechteck, konsequent (Design-Briefing §5).
 * Primary füllt mit `accent-strong` (#5B5BD9) statt `accent` (#6D6DEF):
 * #6D6DEF trägt hellen Text nur mit ~3.8:1 und verfehlt AA — siehe PR-Notiz.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-ct-md font-sans text-[14px] font-semibold leading-5 " +
  "transition-colors duration-150 disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-strong text-on-navy hover:bg-accent-deep disabled:bg-accent-strong/40 disabled:text-on-navy/60",
  secondary:
    "border-2 border-accent bg-transparent text-accent-strong hover:bg-accent/10 disabled:opacity-40",
  ghost:
    "bg-transparent text-accent-strong hover:underline hover:underline-offset-2 disabled:opacity-40",
  destructive:
    "bg-error-ink text-white hover:bg-error-deep disabled:opacity-40",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-10 px-5",
  sm: "h-8 px-3",
};

type OwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: OwnProps & ComponentProps<"button">) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Gleiche Optik als Link — für Navigation statt Aktion. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: OwnProps & ComponentProps<typeof Link>) {
  return (
    <Link {...rest} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
