/**
 * Design token HaKaiTask — PLAN.md §7
 *
 * Gaya "bold minimalism": kertas krem, kartu putih, garis TEBAL hitam,
 * tipografi sans tebal (bukan serif), aksi utama jadi pil hitam solid.
 * Satu sumber kebenaran buat web (CSS variables) dan mobile (JS object).
 * Aturan keras: `accent` HANYA dipakai buat overdue & P1. Semua hirarki lain
 * dibangun dari ukuran, berat font, dan jarak — bukan warna tambahan.
 */

export const color = {
  light: {
    ink: "#111113",
    ink70: "#48484D",
    ink40: "#8C8C92",
    line: "#111113",
    surface: "#FFFFFF",
    paper: "#F2F0EA",
    accent: "#DC2626",
  },
  dark: {
    ink: "#F5F5F2",
    ink70: "#B8B8B4",
    ink40: "#7A7A7E",
    line: "#F5F5F2",
    surface: "#1B1B1D",
    paper: "#101012",
    accent: "#EF4444",
  },
} as const;

export type ColorScheme = keyof typeof color;
export type ColorName = keyof (typeof color)["light"];

/** Opasitas heatmap kontribusi — §6.5a. Indeks = level 0..4. */
export const heatmapAlpha = [0.06, 0.25, 0.45, 0.7, 1.0] as const;

/** Ambang jumlah task selesai → level heatmap. */
export function heatmapLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

export const font = {
  /** Bold minimalism gak pakai serif — display sama sans, dibedain lewat berat & ukuran. */
  display: "'Geist', 'Inter Tight', system-ui, sans-serif",
  sans: "'Geist', 'Inter Tight', system-ui, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
} as const;

/** Skala tipografi — [ukuran px, tinggi baris px, berat, tracking em] */
export const type = {
  display: { size: 44, leading: 46, weight: 800, tracking: -0.02, family: font.display },
  h1: { size: 28, leading: 32, weight: 800, tracking: -0.01, family: font.sans },
  h2: { size: 20, leading: 25, weight: 700, tracking: 0, family: font.sans },
  body: { size: 16, leading: 24, weight: 500, tracking: 0, family: font.sans },
  bodySm: { size: 15, leading: 22, weight: 500, tracking: 0, family: font.sans },
  meta: { size: 12, leading: 16, weight: 700, tracking: 0.03, family: font.sans },
  mono: { size: 13, leading: 18, weight: 500, tracking: 0, family: font.mono },
} as const;

export type TypeName = keyof typeof type;

export const space = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

export const radius = { sm: 12, md: 24, lg: 32, full: 9999 } as const;

export const layout = {
  /** Lebar konten maksimum di web — sengaja sempit biar fokus. */
  maxContentWidth: 640,
  /** Garis tebal ala bold-minimalism — dipakai lewat class border-2/border-3, bukan var CSS ini. */
  borderWidth: 2,
} as const;

export const motion = {
  easing: {
    /** expo-out — easing standar */
    standard: "cubic-bezier(0.22, 1, 0.36, 1)",
    enter: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  duration: { fast: 160, normal: 280, slow: 420 },
  staggerMs: 40,
  lenis: { lerp: 0.09, duration: 1.1, smoothWheel: true },
} as const;

/** Spring setara buat Reanimated (mobile). */
export const spring = {
  standard: { damping: 22, stiffness: 220, mass: 1 },
  press: { damping: 18, stiffness: 320, mass: 0.6 },
} as const;

export const tokens = {
  color,
  heatmapAlpha,
  font,
  type,
  space,
  radius,
  layout,
  motion,
  spring,
} as const;
