import { Skeleton } from "@/shared/ui/skeleton";

export function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

function FormFieldsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

export function AuthPageSkeleton({ label }: { label: string }) {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/25 px-4 py-8">
      <LoadingStatus label={label} />
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm">
        <div className="space-y-3 p-6">
          <Skeleton className="mx-auto h-10 w-10 rounded-full" />
          <Skeleton className="mx-auto h-7 w-44" />
          <Skeleton className="mx-auto h-4 w-64 max-w-full" />
        </div>
        <div className="space-y-4 px-6 pb-6">
          <Skeleton className="h-10 w-full" />
          <FormFieldsSkeleton rows={2} />
        </div>
      </div>
    </main>
  );
}

export function InvitationPageSkeleton({ label }: { label: string }) {
  return <AuthPageSkeleton label={label} />;
}

export function ResetPasswordPageSkeleton({ label }: { label: string }) {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-muted/25 px-4">
      <LoadingStatus label={label} />
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        <div className="mt-6">
          <FormFieldsSkeleton rows={2} />
        </div>
      </div>
    </main>
  );
}

function DashboardListCardSkeleton({
  rows = 3,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-6 shadow-sm ${className}`}>
      <Skeleton className="h-6 w-44" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="rounded-lg border p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPageSkeleton({
  label,
  role = "owner",
  familyName,
}: {
  label: string;
  role?: "owner" | "contributor";
  familyName?: string;
}) {
  return (
    <main
      className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-muted/25"
      data-dashboard-skeleton={role}
    >
      <LoadingStatus label={label} />
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              {familyName ? (
                <h1 className="text-3xl font-bold">{familyName}</h1>
              ) : (
                <Skeleton className="h-9 w-72 max-w-[75vw]" />
              )}
              {role === "contributor" && <Skeleton className="h-5 w-96 max-w-[85vw]" />}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-28" />
              ))}
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-12" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <DashboardListCardSkeleton rows={role === "owner" ? 3 : 1} />
          {role === "owner" && <DashboardListCardSkeleton rows={2} />}
          <DashboardListCardSkeleton rows={5} />
        </div>
        <div className="space-y-5">
          <div className="min-h-80 rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-6 w-40" />
            <div className="mt-6 space-y-5">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {role === "owner" && <DashboardListCardSkeleton rows={3} />}
        </div>
      </section>
    </main>
  );
}

export function TreeLoadingIndicator({ label }: { label: string }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full items-center justify-center bg-muted/20">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary motion-reduce:animate-none"
        />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
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

export function ActivityPageSkeleton({ label }: { label: string }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <LoadingStatus label={label} />
      <Skeleton className="mb-4 h-9 w-24" />
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="space-y-4 p-6">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="p-6 pt-0">
          <ActivityRowsSkeleton />
        </div>
      </div>
    </main>
  );
}

export function SettingsPageSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <LoadingStatus label={label} />
      <Skeleton className="mb-6 h-8 w-40" />
      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-60" />
          </div>
        ))}
        <div className="border-t pt-4">
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    </div>
  );
}

export function MemberFormPageSkeleton({
  label,
  editing = false,
}: {
  label: string;
  editing?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <LoadingStatus label={label} />
      <div className="mb-6 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        {editing && <Skeleton className="h-10 w-28" />}
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <FormFieldsSkeleton rows={6} />
      </div>
    </div>
  );
}

export function MemberPageSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <LoadingStatus label={label} />
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <Skeleton className="h-28 w-28 shrink-0 rounded-2xl" />
          <div className="w-full flex-1 space-y-3">
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-20 rounded-full" />
              ))}
            </div>
          </div>
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="mt-8 border-t pt-6">
            <Skeleton className="mb-4 h-6 w-32" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfilePageSkeleton({ label }: { label: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <LoadingStatus label={label} />
      <Skeleton className="mb-4 h-9 w-24" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-2 h-5 w-80 max-w-full" />
      <div className="mt-7 space-y-6">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="mt-2 h-4 w-64 max-w-full" />
            <div className="mt-6">
              <FormFieldsSkeleton rows={i === 0 ? 3 : 2} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export type PageSkeletonKind =
  | "dashboard"
  | "activity"
  | "profile"
  | "settings"
  | "subfamilies"
  | "add-member"
  | "edit-member"
  | "member"
  | "tree"
  | "auth"
  | "reset-password"
  | "invitation";

export function pageSkeletonKind(pathname: string): PageSkeletonKind {
  if (pathname === "/") return "dashboard";
  if (pathname === "/activity") return "activity";
  if (pathname === "/profile") return "profile";
  if (pathname === "/settings") return "settings";
  if (pathname === "/subfamilies") return "subfamilies";
  if (pathname === "/auth") return "auth";
  if (pathname === "/reset-password") return "reset-password";
  if (/^\/invitation\/[^/]+$/.test(pathname)) return "invitation";
  if (pathname === "/add" || /^\/tree\/[^/]+\/add$/.test(pathname)) return "add-member";
  if (/^\/edit\/[^/]+$/.test(pathname)) return "edit-member";
  if (/^\/member\/[^/]+$/.test(pathname)) return "member";
  if (/^\/tree\/[^/]+$/.test(pathname)) return "tree";
  return "auth";
}

export function RoutePageSkeleton({
  pathname,
  label,
  dashboardRole,
  dashboardName,
}: {
  pathname: string;
  label: string;
  dashboardRole?: "owner" | "contributor";
  dashboardName?: string;
}) {
  switch (pageSkeletonKind(pathname)) {
    case "dashboard":
      return (
        <DashboardPageSkeleton label={label} role={dashboardRole} familyName={dashboardName} />
      );
    case "activity":
      return <ActivityPageSkeleton label={label} />;
    case "profile":
      return <ProfilePageSkeleton label={label} />;
    case "settings":
      return <SettingsPageSkeleton label={label} />;
    case "subfamilies":
      return <SubfamiliesPageSkeleton label={label} />;
    case "add-member":
      return <MemberFormPageSkeleton label={label} />;
    case "edit-member":
      return <MemberFormPageSkeleton label={label} editing />;
    case "member":
      return <MemberPageSkeleton label={label} />;
    case "tree":
      return <TreeLoadingIndicator label={label} />;
    case "reset-password":
      return <ResetPasswordPageSkeleton label={label} />;
    case "invitation":
      return <InvitationPageSkeleton label={label} />;
    case "auth":
      return <AuthPageSkeleton label={label} />;
  }
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
