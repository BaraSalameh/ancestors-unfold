import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useCallback, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { I18nProvider } from "@/shared/i18n";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { PerformanceProvider } from "@/app/providers/performance-provider";
import { themeBootstrapScript } from "@/app/providers/theme";
import { Header } from "@/app/components/header";
import { Toaster } from "@/shared/ui/sonner";
import {
  AuthProvider,
  authSessionQueryKey,
  authSessionQueryOptions,
  readRequestLocale,
  type HydratedAuthSession,
} from "@/features/auth";
import { AuthGuard } from "@/app/components/auth-guard";
import TawkToWidget from "@/shared/ui/tawk-to-widget";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Route error", { name: error.name });
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(authSessionQueryOptions());
    return { session, locale: session?.locale ?? (await readRequestLocale()) };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ancestors Unfold" },
      { name: "description", content: "Build and explore your family tree." },
      { property: "og:title", content: "Ancestors Unfold" },
      { property: "og:description", content: "Build and explore your family tree." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon-light.png",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        href: "/favicon-dark.png",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { locale } = Route.useLoaderData();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <TawkToWidget />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { locale, session } = Route.useLoaderData();
  const handleLangChange = useCallback(
    (locale: HydratedAuthSession["locale"]) => {
      queryClient.setQueryData<HydratedAuthSession | null>(authSessionQueryKey, (current) =>
        current ? { ...current, locale } : current,
      );
    },
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PerformanceProvider>
        <ThemeProvider>
          <I18nProvider initialLang={locale} onLangChange={handleLangChange}>
            <AuthProvider initialSession={session}>
              <div className="min-h-screen bg-background text-foreground">
                <Header />
                <AuthGuard>
                  <Outlet />
                </AuthGuard>
              </div>
            </AuthProvider>
            <Toaster richColors position="top-center" />
          </I18nProvider>
        </ThemeProvider>
      </PerformanceProvider>
    </QueryClientProvider>
  );
}
