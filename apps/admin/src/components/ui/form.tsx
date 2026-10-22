import { clsx } from "clsx";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cloneElement, forwardRef, isValidElement, useId } from "react";

const control =
  "block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-2 focus:outline-offset-0 focus:outline-brand-500/40 disabled:bg-subtle disabled:text-muted aria-[invalid=true]:border-red-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, "h-9 py-0", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={clsx(control, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(control, "h-9 py-0 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  /** A single form control; it receives id, aria-invalid and aria-describedby. */
  children: ReactNode;
}

/** Label + control + hint/error with the accessibility wiring done once. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, "aria-required": required || undefined })
    : children;
  return (
    <div className={clsx("space-y-1", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-red-600">
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  description?: ReactNode;
}

export function Checkbox({ label, checked, onCheckedChange, description, className, ...rest }: CheckboxProps) {
  const id = useId();
  return (
    <div className={clsx("flex items-start gap-2", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-line text-brand-600 accent-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        {...rest}
      />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
    </div>
  );
}

/** A group of checkboxes for a string[] value, rendered as a fieldset. */
export function CheckboxGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  error,
  hint,
  columns = 2,
}: {
  legend: string;
  options: readonly { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  error?: string;
  hint?: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined} className="space-y-2">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className={clsx("grid gap-2", columns === 1 ? "grid-cols-1" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {options.map((o) => (
          <Checkbox
            key={o.value}
            label={o.label}
            description={o.description}
            disabled={o.disabled}
            checked={value.includes(o.value)}
            onCheckedChange={(on) => onChange(on ? [...value, o.value] : value.filter((v) => v !== o.value))}
          />
        ))}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Banner for form-level / API errors. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}
