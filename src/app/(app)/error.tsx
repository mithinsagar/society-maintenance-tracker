'use client';

import { AlertOctagon, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';

/**
 * Route error boundary.
 *
 * Says what happened and what the user can do about it. The digest is shown
 * because it is the one thing that links a user's report to a specific server
 * log line — the error's actual message is not rendered, since it can contain
 * internals.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-lg border border-danger/25 bg-danger-bg text-danger">
          <AlertOctagon className="size-5" aria-hidden />
        </div>

        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          This page could not be loaded
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-subtle">
          Something went wrong while fetching the data for this screen. Your complaints and their
          history are unaffected — this is a display problem, not a data one.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2.5">
          <Button onClick={reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Go to dashboard</Link>
          </Button>
        </div>

        {error.digest ? (
          <p className="mt-6 font-mono text-[11px] text-subtle">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
