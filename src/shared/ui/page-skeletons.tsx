import { Skeleton } from "@/shared/ui/skeleton";

export function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

export function SessionPageSkeleton({ label }: { label: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl items-start px-4 py-10 sm:px-6">
      <LoadingStatus label={label} />
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="mx-auto h-9 w-48" />
        <Skeleton className="mx-auto mt-3 h-4 w-64 max-w-full" />
        <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}

export function DashboardPageSkeleton({ label }: { label: string }) {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <LoadingStatus label={label} />
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="space-y-3">
              <Skeleton className="h-9 w-72 max-w-[75vw]" />
              <Skeleton className="h-4 w-96 max-w-[85vw]" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5 shadow-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-6 w-44" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export function TreePageSkeleton({ label }: { label: string }) {
  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-muted/20">
      <LoadingStatus label={label} />
      <div className="absolute start-4 top-4 z-10 flex gap-2">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="flex h-full items-center justify-center gap-8 px-6">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className={index === 1 ? "-translate-y-16" : "translate-y-12"}>
            <Skeleton className="h-36 w-44 rounded-2xl border" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 end-4 space-y-2">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  );
}

export function SubfamiliesPageSkeleton({ label }: { label: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col gap-4 px-4 py-6">
      <LoadingStatus label={label} />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid flex-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5 shadow-sm">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-2 h-4 w-24" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }, (_, row) => (
                <Skeleton key={row} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export function ActivityRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b pb-3 last:border-0">
          <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
