import { createContext, use, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
  t: (dark: string, light: string) => string;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  isDark: true,
  toggle: () => {},
  t: (dark) => dark,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const isDark = theme === "dark";
  const toggle = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  const t = (dark: string, light: string) => (isDark ? dark : light);

  return (
    <ThemeContext value={{ theme, isDark, toggle, t }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  return use(ThemeContext);
}
