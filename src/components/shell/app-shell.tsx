'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, Menu, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Role } from '@/server/db/schema';

import { ThemeSwitcher } from '../theme';
import { Avatar } from '../ui/primitives';

import { Brand } from './brand';
import { isActive, navFor, type NavItem } from './nav-config';

/**
 * Application shell.
 *
 * Three distinct navigation treatments, because shrinking one layout to fit a
 * phone is what makes an "responsive" admin tool unusable on a phone:
 *
 *   ≥1024px  fixed sidebar, always visible
 *   <1024px  top bar + slide-in drawer
 *   <768px   plus a bottom tab bar for the four primary destinations, so the
 *            most common actions are within thumb reach
 */

export interface ShellUser {
  id: string;
  fullName: string;
  email: string;
  flatNumber: string;
  role: Role;
}

export interface BadgeCounts {
  overdue?: number;
  open?: number;
}

export function AppShell({
  user,
  societyName,
  badges,
  children,
}: {
  user: ShellUser;
  societyName: string;
  badges?: BadgeCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const items = navFor(user.role);

  /**
   * Close the drawer on navigation — leaving it open over the new page is a
   * classic mobile-nav bug.
   *
   * Adjusted during render rather than in an effect. React's documented
   * pattern for "reset state when a value changes" re-runs the component
   * immediately with the corrected state, before anything is painted; an
   * effect would render the stale open drawer first and then close it.
   */
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  // Escape closes the drawer, and body scroll is locked while it is open.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-background">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Brand societyName={societyName} />
        </div>

        <SidebarNav items={items} pathname={pathname} badges={badges} className="flex-1 p-3" />

        <div className="border-t border-border p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* ---------------- Mobile top bar ---------------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
          >
            <Menu className="size-[18px]" aria-hidden />
          </button>
          <Brand societyName={societyName} />
        </div>
        <ThemeSwitcher />
      </header>

      {/* ---------------- Mobile drawer ---------------- */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-foreground/25 animate-fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-border bg-surface animate-rise-in"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Brand societyName={societyName} />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <SidebarNav
              items={items}
              pathname={pathname}
              badges={badges}
              className="flex-1 overflow-y-auto p-3"
            />

            <div className="border-t border-border p-3">
              <UserMenu user={user} />
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- Content ---------------- */}
      <div className="lg:pl-60">
        <main id="main" className="pb-20 md:pb-10">
          {children}
        </main>
      </div>

      {/* ---------------- Mobile bottom bar ---------------- */}
      <MobileTabBar items={items} pathname={pathname} badges={badges} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function NavBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        'ml-auto min-w-[1.25rem] rounded px-1 py-0.5 text-center text-[10px] font-semibold tabular',
        active ? 'bg-primary/15 text-primary' : 'bg-surface-sunken text-subtle',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SidebarNav({
  items,
  pathname,
  badges,
  className,
}: {
  items: NavItem[];
  pathname: string;
  badges?: BadgeCounts;
  className?: string;
}) {
  return (
    <nav className={className} aria-label="Main navigation">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const count = item.badgeKey ? badges?.[item.badgeKey] : undefined;
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium',
                  'transition-colors duration-120',
                  active
                    ? 'bg-primary-subtle text-primary'
                    : 'text-muted hover:bg-surface-sunken hover:text-foreground',
                )}
              >
                {/* Active marker: a rail, not a filled pill. */}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                  />
                ) : null}
                <Icon
                  className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-subtle')}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
                {count !== undefined && count > 0 ? (
                  <NavBadge count={count} active={active} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileTabBar({
  items,
  pathname,
  badges,
}: {
  items: NavItem[];
  pathname: string;
  badges?: BadgeCounts;
}) {
  const primary = items.filter((item) => item.primary).slice(0, 4);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {primary.map((item) => {
        const active = isActive(pathname, item);
        const count = item.badgeKey ? badges?.[item.badgeKey] : undefined;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-subtle',
            )}
          >
            {active ? (
              <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />
            ) : null}
            <span className="relative">
              <Icon className="size-[18px]" aria-hidden />
              {count !== undefined && count > 0 ? (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1 min-w-3.5 rounded-full bg-status-overdue px-1 text-[9px] font-semibold leading-[14px] text-white"
                >
                  {count > 9 ? '9+' : count}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate px-1">{item.shortLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed');
      toast.success('Signed out');
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('Could not sign out', { description: 'Please check your connection and retry.' });
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-sunken data-[state=open]:bg-surface-sunken"
        >
          <Avatar name={user.fullName} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
              {user.fullName}
            </span>
            <span className="block truncate text-[11px] leading-tight text-subtle">
              {user.role === 'ADMIN' ? ROLE_LABELS.ADMIN : user.flatNumber}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-subtle" aria-hidden />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-56 rounded-lg border border-border bg-surface-raised p-1 shadow-popover data-[state=open]:animate-overlay-in"
        >
          <div className="border-b border-border px-2.5 py-2">
            <p className="truncate text-[13px] font-medium text-foreground">{user.fullName}</p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
          </div>

          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="text-xs text-muted">Theme</span>
            <ThemeSwitcher />
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {user.role === 'RESIDENT' ? (
            <DropdownMenu.Item asChild>
              <Link
                href="/profile"
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted outline-none data-[highlighted]:bg-surface-sunken data-[highlighted]:text-foreground"
              >
                <User className="size-4" aria-hidden />
                Profile &amp; password
              </Link>
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item asChild>
              <Link
                href="/admin/settings"
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted outline-none data-[highlighted]:bg-surface-sunken data-[highlighted]:text-foreground"
              >
                <User className="size-4" aria-hidden />
                Account &amp; settings
              </Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Item
            onSelect={(event) => {
              event.preventDefault();
              void signOut();
            }}
            disabled={signingOut}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted outline-none data-[highlighted]:bg-danger-bg data-[highlighted]:text-danger data-[disabled]:opacity-50"
          >
            <LogOut className="size-4" aria-hidden />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ---------------------------------------------------------------------------
// Page header — used by every screen inside the shell.
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-border bg-surface', className)}>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-subtle">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function PageBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8', className)}
      {...props}
    />
  );
}
