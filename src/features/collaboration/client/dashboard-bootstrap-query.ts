import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dashboardBootstrapSchema } from "../domain/dashboard-bootstrap";

const localeSchema = z.enum(["en", "ar"]);

const dashboardBootstrapQueryKey = (locale: "en" | "ar") =>
  ["collaboration", "dashboard", locale] as const;

const readDashboard = createServerFn({ method: "GET" })
  .validator(localeSchema)
  .handler(async ({ data: locale }) => {
    const [{ getRequest }, { authenticate }, { readDashboardBootstrap }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("@/features/auth/server"),
      import("../server/dashboard-bootstrap-service"),
    ]);
    const session = await authenticate(getRequest());
    if (!session) throw new Error("UNAUTHENTICATED");
    return readDashboardBootstrap(session, crypto.randomUUID(), locale);
  });

export function dashboardBootstrapQueryOptions(locale: "en" | "ar") {
  return queryOptions({
    queryKey: dashboardBootstrapQueryKey(locale),
    queryFn: async () => dashboardBootstrapSchema.parse(await readDashboard({ data: locale })),
    staleTime: 60_000,
    retry: 1,
  });
}
