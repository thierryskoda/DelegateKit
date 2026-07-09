import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { Button } from "./button";

type FieldChromeProps = {
  label: string;
  hint?: string;
  error?: string | null;
};

function describedBy(
  existing: string | undefined,
  fieldId: string,
  hint?: string,
  error?: string | null,
): string | undefined {
  return (
    cx(existing, hint ? `${fieldId}-hint` : undefined, error ? `${fieldId}-error` : undefined) ||
    undefined
  );
}

function FieldFrame({
  label,
  hint,
  error,
  fieldId,
  children,
}: FieldChromeProps & { fieldId: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 text-sm font-medium text-secondary">
      <label htmlFor={fieldId}>{label}</label>
      {children}
      {hint ? (
        <span id={`${fieldId}-hint`} className="text-xs font-normal text-tertiary">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${fieldId}-error`} className="text-xs font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type TextFieldProps = FieldChromeProps & ComponentPropsWithRef<"input">;

const inputClassName =
  "min-h-12 w-full rounded-xl border bg-surface px-3.5 text-base text-default shadow-xs outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-muted";

export function TextField({ label, hint, error, className, id, ref, ...props }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame label={label} hint={hint} error={error} fieldId={fieldId}>
      <input
        {...props}
        ref={ref}
        id={fieldId}
        className={cx(inputClassName, error ? "border-danger" : "border-default", className)}
        aria-describedby={describedBy(props["aria-describedby"], fieldId, hint, error)}
        aria-invalid={error ? true : props["aria-invalid"]}
      />
    </FieldFrame>
  );
}

export function PasswordField({
  label,
  hint,
  error,
  className,
  id,
  autoComplete = "current-password",
  type: _type,
  ref,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? "Hide password" : "Show password";

  return (
    <FieldFrame label={label} hint={hint} error={error} fieldId={fieldId}>
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={fieldId}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          className={cx(
            inputClassName,
            "pr-12",
            error ? "border-danger" : "border-default",
            className,
          )}
          aria-describedby={describedBy(props["aria-describedby"], fieldId, hint, error)}
          aria-invalid={error ? true : props["aria-invalid"]}
        />
        <Button
          aria-label={toggleLabel}
          aria-pressed={isVisible}
          className="absolute right-1.5 top-1.5 !rounded-full"
          size="icon"
          title={toggleLabel}
          variant="ghost"
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
    </FieldFrame>
  );
}
