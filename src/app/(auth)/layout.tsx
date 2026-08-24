import { ClipboardCheck, History, Megaphone } from 'lucide-react';

import { Brand } from '@/components/shell/brand';
import { ThemeSwitcher } from '@/components/theme';

/**
 * Authentication shell.
 *
 * A two-panel split on large screens: the form on the left at a comfortable
 * reading measure, and a quiet explanatory panel on the right. The right panel
 * is content, not decoration — it tells a first-time resident what the product
 * actually does before they commit to creating an account.
 *
 * Below `lg` the panel is dropped entirely rather than stacked, because on a
 * phone the only thing that matters is the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Brand />
          <ThemeSwitcher />
        </header>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <footer className="text-xs text-subtle">
          Society Maintenance Tracker · Complaint lifecycle, notices and reporting
        </footer>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-border bg-surface-sunken lg:flex lg:flex-col lg:justify-center lg:px-14">
        {/* A faint blueprint grid — structure, not ornament. No gradients. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 45%, black, transparent)',
          }}
        />

        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Greenwood Heights
          </p>
          <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-foreground">
            Every complaint accounted for, from the day it is raised to the day it is closed.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            One record of what was reported, who acted on it, and when — visible to the resident who
            raised it and to the committee managing it.
          </p>

          <ul className="mt-9 space-y-5">
            <Feature
              icon={<ClipboardCheck />}
              title="A clear workflow"
              body="Open, In Progress, Resolved — with priorities so urgent work surfaces first."
            />
            <Feature
              icon={<History />}
              title="A permanent history"
              body="Every status change records its timestamp, the person who made it, and their note."
            />
            <Feature
              icon={<Megaphone />}
              title="Community notices"
              body="Important announcements are pinned to the board and emailed to every resident."
            />
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span>
        <span className="block text-[13px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-subtle">{body}</span>
      </span>
    </li>
  );
}
