import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Not found.
 *
 * Also what a resident sees when they request a complaint belonging to someone
 * else — the server returns 404 rather than 403 there deliberately, since a
 * 403 would confirm the record exists. The copy is written to fit both cases
 * without hinting at which one occurred.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-lg border border-border bg-surface-sunken text-subtle">
          <FileQuestion className="size-5" aria-hidden />
        </div>

        <h1 className="text-lg font-semibold tracking-tight text-foreground">Not found</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-subtle">
          This page does not exist, or you do not have access to it. If you followed a link from an
          email, the complaint may have been raised under a different account.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2.5">
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/complaints">My complaints</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
