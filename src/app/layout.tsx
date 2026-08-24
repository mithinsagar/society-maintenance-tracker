import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Toaster } from 'sonner';

import { ThemeProvider, ThemeScript } from '@/components/theme';

import './globals.css';

/**
 * Root layout.
 *
 * Fonts are self-hosted through the `geist` package rather than fetched from a
 * CDN: no third-party request on first paint, no FOUT, and nothing for the
 * Content-Security-Policy to have to allow.
 */

export const metadata: Metadata = {
  title: {
    default: 'Society Maintenance Tracker',
    template: '%s · Society Maintenance',
  },
  description:
    'Raise, track and resolve society maintenance complaints with a full audit trail, overdue detection and a community notice board.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFBF9' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0D0E' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* First stop for keyboard users, before the whole navigation. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to main content
        </a>

        <ThemeProvider>
          {children}

          <Toaster
            position="bottom-right"
            gap={10}
            offset={16}
            toastOptions={{
              // Styled with the product's own tokens so toasts are correct in
              // both themes without a second palette to maintain.
              classNames: {
                toast:
                  'group !bg-surface-raised !border !border-border !text-foreground !rounded-lg !shadow-overlay !text-[13px]',
                title: '!font-medium',
                description: '!text-subtle !text-xs',
                actionButton: '!bg-primary !text-primary-foreground !text-xs !rounded',
                cancelButton: '!bg-surface-sunken !text-muted !text-xs !rounded',
                success: '[&_[data-icon]]:!text-success',
                error: '[&_[data-icon]]:!text-danger',
                warning: '[&_[data-icon]]:!text-warning',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
