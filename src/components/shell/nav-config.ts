import {
  BarChart3,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Megaphone,
  PlusCircle,
  Settings,
  Timer,
  User,
  type LucideIcon,
} from 'lucide-react';

import type { Role } from '@/server/db/schema';

/**
 * Navigation, declared as data.
 *
 * Both shells render from these tables, so desktop sidebar, mobile tab bar and
 * mobile drawer can never drift out of sync — and adding a screen is one entry
 * rather than three edits.
 *
 * These lists shape the UI only. Every route is independently protected on the
 * server; hiding a link is not access control.
 */

export interface NavItem {
  href: string;
  label: string;
  /**
   * Label for the mobile tab bar, where the full one will not fit. Set
   * explicitly rather than truncated at the first word — "My Complaints" would
   * become "My", which tells the user nothing.
   */
  shortLabel?: string;
  icon: LucideIcon;
  /** Matches nested routes too (e.g. /complaints/:id under /complaints). */
  matchPrefix?: boolean;
  /** Shown in the mobile bottom bar. Kept to four for touch-target comfort. */
  primary?: boolean;
  /** Key into the badge counts supplied by the shell. */
  badgeKey?: 'overdue' | 'open';
}

export const RESIDENT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard, primary: true },
  {
    href: '/complaints',
    label: 'My Complaints',
    shortLabel: 'Complaints',
    icon: ClipboardList,
    matchPrefix: true,
    primary: true,
  },
  {
    href: '/complaints/new',
    label: 'Raise Complaint',
    shortLabel: 'Raise',
    icon: PlusCircle,
    primary: true,
  },
  { href: '/notices', label: 'Notice Board', shortLabel: 'Notices', icon: Megaphone, primary: true },
  { href: '/profile', label: 'Profile', icon: User },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, primary: true },
  {
    href: '/admin/complaints',
    label: 'Complaints',
    icon: ClipboardList,
    matchPrefix: true,
    primary: true,
    badgeKey: 'open',
  },
  { href: '/admin/overdue', label: 'Overdue', icon: Timer, primary: true, badgeKey: 'overdue' },
  {
    href: '/admin/notices',
    label: 'Notice Board',
    shortLabel: 'Notices',
    icon: Megaphone,
    primary: true,
  },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/emails', label: 'Email Log', icon: Mail },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function navFor(role: Role): NavItem[] {
  return role === 'ADMIN' ? ADMIN_NAV : RESIDENT_NAV;
}

export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/dashboard';
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    // `/complaints/new` must not light up `/complaints` as well.
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

export { Building2 };
