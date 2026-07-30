/* eslint-disable max-lines-per-function, complexity -- Infinite activity feed coordinates search, cancellation, cursor paging, and observer fallback. */
import { Link } from "@tanstack/react-router";
import { Activity, ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  activityDescription,
  type ActivityItem,
  type ActivityPageResponse,
} from "@/features/trees";
import { useI18n, type Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { ActivityRowsSkeleton, LoadingStatus } from "@/shared/ui/page-skeletons";

type CurrentTree = { id: string; name_en: string | null; name_ar: string | null };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) throw new Error("REQUEST_FAILED");
  return response.json() as Promise<T>;
}

const activityUrl = (treeId: string, query: string, lang: Lang, cursor?: string | null) => {
  const parameters = new URLSearchParams({ limit: "25", locale: lang });
  if (query) parameters.set("query", query);
  if (cursor) parameters.set("cursor", cursor);
  return `/api/trees/${treeId}/activity?${parameters}`;
};

export function ActivityPage() {
  const { t, lang } = useI18n();
  const [tree, setTree] = useState<CurrentTree>();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const loadingRequest = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void getJson<CurrentTree>("/api/tree/current", controller.signal)
      .then(setTree)
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [retryVersion]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!tree) return;
    const generation = ++requestGeneration.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setNextCursor(null);
    loadingRequest.current = true;
    setLoading(true);
    setError(false);
    void getJson<ActivityPageResponse>(
      activityUrl(tree.id, debouncedQuery, lang),
      controller.signal,
    )
      .then((page) => {
        if (requestGeneration.current !== generation) return;
        setActivity(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((requestError: unknown) => {
        if (
          requestGeneration.current === generation &&
          (requestError as { name?: string }).name !== "AbortError"
        )
          setError(true);
      })
      .finally(() => {
        if (requestGeneration.current === generation) {
          loadingRequest.current = false;
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [tree, debouncedQuery, lang, retryVersion]);

  const loadNext = useCallback(async () => {
    if (!tree || !nextCursor || loadingRequest.current) return;
    const generation = requestGeneration.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    loadingRequest.current = true;
    setLoading(true);
    setError(false);
    try {
      const page = await getJson<ActivityPageResponse>(
        activityUrl(tree.id, debouncedQuery, lang, nextCursor),
        controller.signal,
      );
      if (requestGeneration.current !== generation) return;
      setActivity((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      if (
        requestGeneration.current === generation &&
        (requestError as { name?: string }).name !== "AbortError"
      )
        setError(true);
    } finally {
      if (requestGeneration.current === generation) {
        loadingRequest.current = false;
        setLoading(false);
      }
    }
  }, [tree, nextCursor, debouncedQuery, lang]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !nextCursor || loading || error) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadNext();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [nextCursor, loading, error, loadNext]);

  const retry = () => {
    if (activity.length) void loadNext();
    else setRetryVersion((version) => version + 1);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/">
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
          {t("back")}
        </Link>
      </Button>
      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>
            {t("activity_history")}
            {tree ? ` — ${lang === "ar" ? tree.name_ar || tree.name_en : tree.name_en}` : ""}
          </CardTitle>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("activity_search_placeholder")}
            aria-label={t("activity_search_label")}
          />
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {loading && <LoadingStatus label={t("activity_loading")} />}
          {!loading && !error && activity.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {debouncedQuery ? t("activity_no_search_results") : t("no_activity")}
            </p>
          )}
          {activity.map((row) => (
            <div key={row.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
              <Activity className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{activityDescription(row, lang, t)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString(lang === "ar" ? "ar" : "en")}
                </p>
              </div>
            </div>
          ))}
          {loading && <ActivityRowsSkeleton count={activity.length > 0 ? 3 : 5} />}
          {error && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">{t("activity_load_failed")}</p>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {t("retry")}
              </Button>
            </div>
          )}
          {nextCursor && !error && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              loading={loading}
              onClick={() => void loadNext()}
            >
              {t("activity_load_more")}
            </Button>
          )}
          {!loading && !error && activity.length > 0 && !nextCursor && (
            <p className="text-center text-xs text-muted-foreground">
              {t("activity_end_of_history")}
            </p>
          )}
          <div ref={sentinel} aria-hidden="true" className="h-1" />
        </CardContent>
      </Card>
    </main>
  );
}
