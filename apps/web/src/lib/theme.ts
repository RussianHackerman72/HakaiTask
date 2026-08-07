/**
 * Dark mode (§5.1 #8) — ikut sistem sampai user milih sendiri.
 * Nilai warnanya sendiri hidup di CSS variable dari packages/tokens.
 */
import { useCallback, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "hakaitask-theme";

function read(): ThemePref {
  const raw = localStorage.getItem(KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function apply(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export function useTheme(): {
  pref: ThemePref;
  resolved: "light" | "dark";
  toggle: () => void;
} {
  const [pref, setPref] = useState<ThemePref>(() => read());
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    apply(pref);
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  }, [pref]);

  const resolved: "light" | "dark" =
    pref === "system" ? (systemDark ? "dark" : "light") : pref;

  const toggle = useCallback(() => {
    setPref(resolved === "dark" ? "light" : "dark");
  }, [resolved]);

  return { pref, resolved, toggle };
}
