import { Loader2 } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cx } from "../lib/cx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "text";
type ButtonSize = "md" | "sm" | "compact" | "icon";

const baseButtonClassName =
  "motion-action inline-flex touch-manipulation items-center justify-center gap-2 border font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-default";

const variantClassName = {
  primary: "border-transparent bg-primary text-white shadow-sm hover:bg-primary/90",
  secondary: "border-primary/40 bg-surface text-primary hover:bg-primary/5",
  ghost: "border-transparent bg-transparent text-secondary hover:bg-surface-secondary hover:text-default",
  danger: "border-transparent bg-danger text-white shadow-sm hover:bg-danger/90",
} as const satisfies Record<Exclude<ButtonVariant, "text">, string>;

const sizeClassName = {
  md: "min-h-12 rounded-full px-5 py-2.5 text-base",
  sm: "min-h-10 rounded-full px-4 py-2 text-sm",
  compact: "min-h-8 rounded-lg px-3 py-1.5 text-xs",
  icon: "size-9 rounded-lg p-0 text-sm",
} as const satisfies Record<ButtonSize, string>;

const textButtonSizeClassName = {
  md: "text-base",
  sm: "text-sm",
  compact: "text-xs",
  icon: "text-sm",
} as const satisfies Record<ButtonSize, string>;

const textButtonClassName =
  "motion-action touch-manipulation p-0 font-semibold text-primary transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-default";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
};

export function Button({
  block = false,
  className,
  children,
  disabled,
  loading = false,
  variant = "primary",
  size = "md",
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  if (variant === "text") {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading ? true : props["aria-busy"]}
        className={cx(
          textButtonClassName,
          textButtonSizeClassName[size],
          block ? "w-full justify-center" : undefined,
          className,
        )}
        {...props}
      >
        {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
        {children}
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : props["aria-busy"]}
      className={cx(
        baseButtonClassName,
        variantClassName[variant],
        sizeClassName[size],
        block ? "w-full" : undefined,
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

const textLinkClassName =
  "motion-action min-h-11 touch-manipulation p-0 text-left text-base font-medium text-default underline underline-offset-4 transition-colors hover:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-default";

export function TextLink({
  className,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button">) {
  return <button type={type} className={cx(textLinkClassName, className)} {...props} />;
}
