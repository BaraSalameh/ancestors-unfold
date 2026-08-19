import { useEffect, type ReactNode } from "react";
import { observeClientPerformance } from "@/shared/performance/client-vitals";

export function PerformanceProvider({ children }: { children: ReactNode }) {
  useEffect(() => observeClientPerformance(), []);
  return children;
}
