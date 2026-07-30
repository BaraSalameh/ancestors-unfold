import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

const Ctx = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useLayoutEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    const next = resolveTheme(saved, window.matchMedia("(prefers-color-scheme: dark)").matches);
    setThemeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_STORAGE_KEY, t);
  };

  return (
    <Ctx.Provider
      value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside provider");
  return c;
}
