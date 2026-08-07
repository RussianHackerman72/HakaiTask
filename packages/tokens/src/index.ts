/**
 * Design token HaKaiTask — PLAN.md §7
 *
 * Gaya "soft minimalism": background abu-abu DINGIN, kartu putih polos
 * TANPA garis (elevasi murni dari kontras surface vs paper), sudut membulat
 * besar, tipografi geometric sans tebal, aksi utama jadi pil hitam solid.
 * Satu sumber kebenaran buat web (CSS variables) dan mobile (JS object).
 * Aturan keras: `accent` HANYA dipakai buat overdue & P1. Semua hirarki lain
 * dibangun dari ukuran, berat font, dan jarak — bukan warna tambahan.
 */

export const color = {
  light: {
    ink: "#0D0D0F",
    ink70: "#5A5A60",
    ink40: "#9A9AA1",
    /** Divider tipis. Sengaja nyaris gak kelihatan — pemisah utama itu jarak. */
    line: "#E7E7E7",
    /** Isian lembut buat chip & tombol ikon di atas kartu putih. */
    subtle: "#F1F1F1",
    surface: "#FFFFFF",
    paper: "#F0F0F0",
    accent: "#DC2626",
  },
  dark: {
    ink: "#F7F7F5",
    ink70: "#A8A8AD",
    ink40: "#74747A",
    line: "#2B2B2E",
    subtle: "#27272B",
    surface: "#1A1A1C",
    paper: "#0E0E10",
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
  /**
   * Geometric sans, bukan grotesk teknis — ini yang bikin karakternya beda.
   * Satu keluarga buat display & body, dibedain lewat berat dan ukuran.
   */
  display: "'Plus Jakarta Sans', 'Inter Tight', system-ui, sans-serif",
  sans: "'Plus Jakarta Sans', 'Inter Tight', system-ui, sans-serif",
  /** Dipakai TIPIS-TIPIS: cuma buat nampilin teks mentah di preview parser. */
  mono: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
} as const;

/** Skala tipografi — [ukuran px, tinggi baris px, berat, tracking em] */
export const type = {
  display: { size: 44, leading: 48, weight: 800, tracking: -0.03, family: font.display },
  h1: { size: 28, leading: 34, weight: 800, tracking: -0.02, family: font.sans },
  h2: { size: 20, leading: 26, weight: 700, tracking: -0.01, family: font.sans },
  body: { size: 16, leading: 24, weight: 500, tracking: 0, family: font.sans },
  bodySm: { size: 15, leading: 22, weight: 500, tracking: 0, family: font.sans },
  /** Label seksi — sentence case, BUKAN uppercase (referensi gak pakai uppercase). */
  meta: { size: 13, leading: 18, weight: 700, tracking: 0, family: font.sans },
  /** Angka & waktu — sans yang sama, cuma dikunci lebarnya biar gak goyang. */
  num: { size: 13, leading: 18, weight: 600, tracking: 0, family: font.sans },
  mono: { size: 13, leading: 18, weight: 500, tracking: 0, family: font.mono },
} as const;

export type TypeName = keyof typeof type;

export const space = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

export const radius = { sm: 14, md: 28, lg: 36, full: 9999 } as const;

export const layout = {
  /** Lebar konten maksimum di web — sengaja sempit biar fokus. */
  maxContentWidth: 640,
  /** Divider tipis doang. Kartu sendiri gak pakai border sama sekali. */
  borderWidth: 1,
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
