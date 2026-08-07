/**
 * Preset animasi — PLAN.md §7.4.
 * Nilai easing & durasi diambil dari packages/tokens, bukan diketik ulang.
 */
import type { Transition, Variants } from "framer-motion";
import { motion as tok } from "@hakaitask/tokens";

/** cubic-bezier token → array yang dimengerti framer-motion. */
function bezier(css: string): [number, number, number, number] {
  const nums = css.match(/-?\d*\.?\d+/g)!.map(Number);
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}

export const ease = {
  standard: bezier(tok.easing.standard),
  enter: bezier(tok.easing.enter),
} as const;

export const dur = {
  fast: tok.duration.fast / 1000,
  normal: tok.duration.normal / 1000,
  slow: tok.duration.slow / 1000,
} as const;

export const stagger = tok.staggerMs / 1000;

export const enterTransition: Transition = { duration: dur.slow, ease: ease.enter };
export const normalTransition: Transition = { duration: dur.normal, ease: ease.standard };

/** Fade + naik 12px — dipakai focus card & blok halaman (§7.4). */
export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: enterTransition },
  exit: { opacity: 0, y: -8, transition: { duration: dur.fast, ease: ease.standard } },
};

/** Kontainer list: anak-anaknya masuk bergantian tiap 40ms. */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: 0.06 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: normalTransition },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    transition: { duration: dur.normal, ease: ease.standard },
  },
};

/** Sheet detail naik dari bawah (§5.1 #2). */
export const sheet: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: enterTransition },
  exit: { y: "100%", transition: { duration: dur.normal, ease: ease.standard } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: dur.normal } },
  exit: { opacity: 0, transition: { duration: dur.fast } },
};

/** Tekan tombol: scale 0.97 (§7.4). */
export const press = { scale: 0.97 } as const;
