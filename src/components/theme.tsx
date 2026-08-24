'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Theme system.
 *
 * Three states, not two: Light, Dark, and System. The product defaults to
 * Light as specified; System is offered for people who already manage this at
 * the OS level, and an explicit choice always wins.
 *
 * The preference persists in localStorage and is applied by a blocking inline
 * script in <head> (`ThemeScript`) so the correct theme is painted on the very
 * first frame. Without that, a dark-mode user sees a white flash on every cold
 * load — the single most common way a theme switcher feels broken.
 *
 * The stored preference is read with `useSyncExternalStore` rather than an
 * effect. localStorage is external state that differs between server and
 * client, which is exactly what that hook exists for: it gives the server a
 * defined snapshot ('light'), reads the real value on the client, and keeps
 * every tab in sync — without the cascading re-render that a
 * setState-in-effect would cause on every mount.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'smt-theme';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

// ---------------------------------------------------------------------------
// External store over localStorage
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the theme should update this one too.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function getSnapshot(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'light';
  } catch {
    // Private browsing or blocked storage.
    return 'light';
  }
}

/** The server has no localStorage; Light is the documented default. */
function getServerSnapshot(): ThemePreference {
  return 'light';
}

function writePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The theme still applies for this session; it just will not be remembered.
  }
  emit();
}

// ---------------------------------------------------------------------------
// Applying the theme to the document
// ---------------------------------------------------------------------------

function resolve(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyToDocument(preference: ThemePreference): void {
  const dark = resolve(preference) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  // Tells the browser which scrollbar and form-control palette to use.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

/**
 * Runs before first paint. Kept as a raw string and injected synchronously —
 * a React effect would run after the first paint, which is too late.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var pref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPreference = React.useCallback((next: ThemePreference) => {
    applyToDocument(next);
    writePreference(next);
  }, []);

  // Keeps the document in step when the preference changes in another tab.
  // This writes to the DOM (an external system), which is what an effect is
  // actually for — it sets no React state.
  React.useEffect(() => {
    applyToDocument(preference);
  }, [preference]);

  // Follow the OS in real time, but only while "System" is selected.
  React.useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyToDocument('system');
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [preference]);

  const value = React.useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Segmented control rather than a toggle.
 *
 * A two-state toggle cannot express "follow my system", and a toggle's meaning
 * is ambiguous — does the moon mean it *is* dark, or that clicking makes it
 * dark? Three explicit segments with the active one marked leave no doubt.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setPreference(value)}
            className={cn(
              'flex size-6 items-center justify-center rounded transition-colors duration-120',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              active
                ? 'bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                : 'text-subtle hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
