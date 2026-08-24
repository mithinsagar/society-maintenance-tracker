'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * `Field` wires label, control, hint and error together with real `htmlFor`,
 * `aria-describedby` and `aria-invalid` relationships. Doing this once here is
 * what makes every form in the app accessible by default, rather than relying
 * on each screen to remember.
 */

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(function Label({ className, children, required, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-[13px] font-medium text-foreground leading-none', className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-danger ml-0.5" aria-hidden>
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
});

interface FieldContextValue {
  id: string;
  hintId: string;
  errorId: string;
  hasError: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

export function useFieldContext() {
  return React.useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Renders the label visually hidden but still available to screen readers. */
  hideLabel?: boolean;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  hideLabel,
}: FieldProps) {
  const id = React.useId();
  const value = React.useMemo<FieldContextValue>(
    () => ({ id, hintId: `${id}-hint`, errorId: `${id}-error`, hasError: Boolean(error) }),
    [id, error],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('space-y-1.5', className)}>
        <Label htmlFor={id} required={required} className={hideLabel ? 'sr-only' : undefined}>
          {label}
        </Label>

        {children}

        {hint && !error ? (
          <p id={value.hintId} className="text-xs text-subtle leading-relaxed">
            {hint}
          </p>
        ) : null}

        {/* aria-live so a validation message is announced when it appears. */}
        {error ? (
          <p
            id={value.errorId}
            role="alert"
            className="flex items-start gap-1.5 text-xs text-danger leading-relaxed"
          >
            <AlertCircle className="size-3.5 shrink-0 mt-px" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const controlStyles = [
  'w-full rounded-md border bg-surface text-sm text-foreground',
  'placeholder:text-subtle',
  'transition-[border-color,box-shadow] duration-120 ease-out',
  'focus:outline-none focus-visible:outline-none',
  'focus:border-primary focus:ring-2 focus:ring-ring/20',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20',
].join(' ');

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const field = useFieldContext();
    return (
      <input
        ref={ref}
        id={props.id ?? field?.id}
        aria-invalid={field?.hasError || undefined}
        aria-describedby={field ? (field.hasError ? field.errorId : field.hintId) : undefined}
        className={cn(controlStyles, 'h-9 px-3 border-border-strong', className)}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  const field = useFieldContext();
  return (
    <textarea
      ref={ref}
      id={props.id ?? field?.id}
      aria-invalid={field?.hasError || undefined}
      aria-describedby={field ? (field.hasError ? field.errorId : field.hintId) : undefined}
      className={cn(
        controlStyles,
        'min-h-24 px-3 py-2 border-border-strong resize-y leading-relaxed',
        className,
      )}
      {...props}
    />
  );
});

/** Live character counter that only turns red once the limit is actually passed. */
export function CharacterCount({ value, max }: { value: string; max: number }) {
  const count = value.length;
  const nearLimit = count > max * 0.9;

  return (
    <span
      className={cn(
        'text-xs tabular tabular-nums',
        count > max ? 'text-danger font-medium' : nearLimit ? 'text-warning' : 'text-subtle',
      )}
    >
      {count.toLocaleString('en-IN')} / {max.toLocaleString('en-IN')}
    </span>
  );
}
