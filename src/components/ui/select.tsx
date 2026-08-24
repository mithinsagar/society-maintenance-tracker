'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { useFieldContext } from './field';

/**
 * Select, on Radix primitives.
 *
 * A native <select> cannot show a description line per option or a status dot,
 * both of which this product needs. Radix supplies the keyboard model, typeahead
 * and focus management that a hand-rolled dropdown almost always gets wrong.
 */

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  const field = useFieldContext();

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      id={props.id ?? field?.id}
      aria-invalid={field?.hasError || undefined}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border-strong',
        'bg-surface px-3 text-sm text-foreground text-left',
        'transition-[border-color,box-shadow] duration-120 ease-out',
        'data-[placeholder]:text-subtle',
        'focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/20',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle',
        'aria-[invalid=true]:border-danger',
        '[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-subtle transition-transform duration-150 data-[state=open]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          'relative z-50 max-h-80 min-w-[10rem] overflow-hidden rounded-lg border border-border',
          'bg-surface-raised shadow-popover',
          'data-[state=open]:animate-overlay-in',
          position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn('p-1', position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]')}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    description?: string;
    indicator?: React.ReactNode;
  }
>(function SelectItem({ className, children, description, indicator, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-start gap-2.5 rounded-md py-1.5 pl-2.5 pr-8 text-sm',
        'outline-none transition-colors duration-100',
        'data-[highlighted]:bg-primary-subtle data-[highlighted]:text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      {indicator ? <span className="mt-1 shrink-0">{indicator}</span> : null}

      <span className="min-w-0 flex-1">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description ? (
          <span className="mt-0.5 block text-xs leading-snug text-subtle">{description}</span>
        ) : null}
      </span>

      <span className="absolute right-2.5 top-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3.5 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
});

export const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
});

export const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle',
        className,
      )}
      {...props}
    />
  );
});
