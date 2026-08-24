import { PageBody } from '@/components/shell/app-shell';
import { Skeleton } from '@/components/ui/primitives';

/**
 * Route-level loading skeleton.
 *
 * Mirrors the real page's structure — header, KPI row, content block — so the
 * layout does not jump when the data arrives. A centred spinner would tell the
 * user nothing about what is coming and would shift everything on swap.
 */
export default function Loading() {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="mt-2.5 h-3.5 w-full max-w-md" />
        </div>
      </div>

      <PageBody className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="size-7 rounded-md" />
              </div>
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-2 h-2.5 w-24" />
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-5 py-3.5">
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-5 py-3.5">
                <Skeleton className="h-3 w-20 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-5 w-20 shrink-0 rounded" />
                <Skeleton className="h-3 w-14 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
}
