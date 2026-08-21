import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { normalizeLang, type Lang } from "@/locales";
import type { AuthSession } from "../domain/auth-service";

export const authSessionQueryKey = ["auth", "session"] as const;

export type HydratedAuthSession = AuthSession & { locale: Lang };

function requestLocale(request: Request): Lang {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ft:lang="))
    ?.slice("ft:lang=".length);
  return normalizeLang(cookie ?? null) ?? "en";
}

const readAuthSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<HydratedAuthSession | null> => {
    const [{ getRequest }, { authenticate, authSessionDto }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("../server/session-service"),
    ]);
    const request = getRequest();
    const session = await authenticate(request);
    return session
      ? { ...(await authSessionDto(session, crypto.randomUUID())), locale: requestLocale(request) }
      : null;
  },
);

export const readRequestLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<Lang> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    return requestLocale(getRequest());
  },
);

export function authSessionQueryOptions() {
  return queryOptions({
    queryKey: authSessionQueryKey,
    queryFn: () => readAuthSession(),
    staleTime: 30_000,
    retry: false,
  });
}
