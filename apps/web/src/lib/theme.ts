/**
 * Dark mode (§5.1 #8) — ikut sistem sampai user milih sendiri.
 *
 * Kebijakannya ada di `packages/app/src/theme.ts`, dipakai bareng sama mobile.
 * Yang tinggal di sini cuma bagian yang emang cuma ada di web: nyetel atribut
 * `data-theme` biar CSS variable dari packages/tokens kebalik, dan dengerin
 * `prefers-color-scheme`.
 *
 * Dulu berkas ini punya salinannya sendiri — kunci yang sama, arti "system"
 * yang sama, aturan toggle yang sama — ditulis dua kali. Gak pernah kelihatan
 * salah karena kebetulan dua-duanya sama persis, dan itu justru masalahnya:
 * yang pertama diubah cuma di satu sisi bakal bikin web sama mobile beda
 * pendapat soal tema, lewat kunci penyimpanan yang sama.
 */
import { useCallback, useEffect, useState } from "react";
import {
  nextTheme,
  readThemePref,
  resolveTheme,
  writeThemePref,
  type ResolvedTheme,
  type ThemePref,
} from "@hakaitask/app/theme";

export type { ThemePref };

function apply(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  toggle: () => void;
} {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref());
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
    writeThemePref(pref);
  }, [pref]);

  const resolved = resolveTheme(pref, systemDark);

  const toggle = useCallback(() => {
    setPref(nextTheme(resolved));
  }, [resolved]);

  return { pref, resolved, toggle };
}
