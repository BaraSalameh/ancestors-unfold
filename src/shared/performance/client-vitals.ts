type ClientPerformanceMetric = {
  name: "cls" | "hydration" | "inp" | "lcp" | "long-task";
  value: number;
};

function report(metric: ClientPerformanceMetric) {
  window.dispatchEvent(
    new CustomEvent<ClientPerformanceMetric>("ancestors:performance", {
      detail: Object.freeze(metric),
    }),
  );
}

export function observeClientPerformance() {
  if (typeof PerformanceObserver === "undefined") return () => undefined;
  const observers: PerformanceObserver[] = [];
  const observe = (
    type: string,
    callback: PerformanceObserverCallback,
    durationThreshold?: number,
  ) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    const observer = new PerformanceObserver(callback);
    const options: PerformanceObserverInit & { durationThreshold?: number } = {
      type,
      buffered: true,
      durationThreshold,
    };
    observer.observe(options);
    observers.push(observer);
  };

  observe("largest-contentful-paint", (list) => {
    const latest = list.getEntries().at(-1);
    if (latest) report({ name: "lcp", value: latest.startTime });
  });

  let cumulativeLayoutShift = 0;
  observe("layout-shift", (list) => {
    for (const entry of list.getEntries() as Array<
      PerformanceEntry & { hadRecentInput: boolean; value: number }
    >)
      if (!entry.hadRecentInput) cumulativeLayoutShift += entry.value;
    report({ name: "cls", value: cumulativeLayoutShift });
  });

  observe("longtask", (list) => {
    for (const entry of list.getEntries())
      if (entry.duration >= 50) report({ name: "long-task", value: entry.duration });
  });

  let interactionLatency = 0;
  observe(
    "event",
    (list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { interactionId: number }
      >) {
        if (entry.interactionId > 0)
          interactionLatency = Math.max(interactionLatency, entry.duration);
      }
      if (interactionLatency) report({ name: "inp", value: interactionLatency });
    },
    16,
  );

  report({ name: "hydration", value: performance.now() });
  return () => observers.forEach((observer) => observer.disconnect());
}
