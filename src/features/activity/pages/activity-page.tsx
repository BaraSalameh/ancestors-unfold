import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { ActivityRowsSkeleton, LoadingStatus } from "@/shared/ui/page-skeletons";
import { activityQueryOptions } from "../client/activity-query";
import { activityDescription, type ActivityItem } from "../domain/activity-label";

type ActivityTree = { id: string; nameEn: string | null; nameAr: string | null };

function useDebouncedQuery(query: string) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);
  return debounced;
}

function useLoadMoreOnVisible(loadMore: () => void, enabled: boolean) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !enabled) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, loadMore]);
  return sentinel;
}

export function ActivityPage({ tree }: { tree: ActivityTree | null }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedQuery(query);
  const locale = debouncedQuery ? lang : "en";
  const feed = useInfiniteQuery({
    ...activityQueryOptions(
      tree?.id ?? "00000000-0000-4000-8000-000000000000",
      debouncedQuery,
      locale,
    ),
    enabled: Boolean(tree),
    placeholderData: keepPreviousData,
  });
  const activity = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feed;
  const loadNext = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const sentinel = useLoadMoreOnVisible(
    loadNext,
    Boolean(hasNextPage && !isFetchingNextPage && !feed.isError),
  );
  const initialPending = feed.isPending && activity.length === 0;
  const initialError = (!tree || feed.isError) && activity.length === 0;

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
            {tree ? ` — ${localizedTreeName(tree, lang)}` : ""}
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
          <ActivityFeed
            activity={activity}
            debouncedQuery={debouncedQuery}
            error={feed.isError}
            fetching={feed.isFetching}
            fetchingNext={isFetchingNextPage}
            hasNext={Boolean(hasNextPage)}
            initialError={initialError}
            initialPending={initialPending}
            lang={lang}
            loadNext={loadNext}
            refetch={() => void feed.refetch()}
            t={t}
          />
          <div ref={sentinel} aria-hidden="true" className="h-1" />
        </CardContent>
      </Card>
    </main>
  );
}

type ActivityFeedProps = {
  activity: ActivityItem[];
  debouncedQuery: string;
  error: boolean;
  fetching: boolean;
  fetchingNext: boolean;
  hasNext: boolean;
  initialError: boolean;
  initialPending: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  loadNext: () => void;
  refetch: () => void;
  t: ReturnType<typeof useI18n>["t"];
};

function ActivityFeed(props: ActivityFeedProps) {
  return (
    <>
      <FeedLoadingStatus show={props.fetching} label={props.t("activity_loading")} />
      <EmptyFeedState {...props} />
      <ActivityRows activity={props.activity} lang={props.lang} t={props.t} />
      <PendingRows {...props} />
      <FeedError {...props} />
      <LoadMore {...props} />
      <EndOfFeed {...props} />
    </>
  );
}

function FeedLoadingStatus({ show, label }: { show: boolean; label: string }) {
  return show ? <LoadingStatus label={label} /> : null;
}

function EmptyFeedState(props: ActivityFeedProps) {
  if (props.initialPending || props.initialError || props.activity.length) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {props.debouncedQuery ? props.t("activity_no_search_results") : props.t("no_activity")}
    </p>
  );
}

function ActivityRows({ activity, lang, t }: Pick<ActivityFeedProps, "activity" | "lang" | "t">) {
  return activity.map((row) => (
    <div key={row.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
      <Activity className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{activityDescription(row, lang, t)}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString(lang === "ar" ? "ar" : "en")}
        </p>
      </div>
    </div>
  ));
}

function PendingRows(props: ActivityFeedProps) {
  if (!props.initialPending && !props.fetchingNext) return null;
  return <ActivityRowsSkeleton count={props.activity.length ? 3 : 5} />;
}

function FeedError(props: ActivityFeedProps) {
  if (!props.initialError && !(props.error && props.activity.length)) return null;
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-destructive">{props.t("activity_load_failed")}</p>
      <Button type="button" variant="outline" size="sm" onClick={props.refetch}>
        {props.t("retry")}
      </Button>
    </div>
  );
}

function LoadMore(props: ActivityFeedProps) {
  if (!props.hasNext || props.error) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      loading={props.fetchingNext}
      onClick={props.loadNext}
    >
      {props.t("activity_load_more")}
    </Button>
  );
}

function EndOfFeed(props: ActivityFeedProps) {
  if (props.fetching || props.error || !props.activity.length || props.hasNext) return null;
  return (
    <p className="text-center text-xs text-muted-foreground">
      {props.t("activity_end_of_history")}
    </p>
  );
}

function localizedTreeName(tree: ActivityTree, lang: "en" | "ar") {
  return lang === "ar" ? tree.nameAr || tree.nameEn : tree.nameEn || tree.nameAr;
}
