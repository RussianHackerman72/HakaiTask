/**
 * Pencocokan frasa buat pipeline chat — PLAN-CHAT.md §5.2
 *
 * Dipisah dari parser lama karena bekerja di atas `string[]` polos, bukan
 * `Token` internal parser. Aturannya cuma satu dan berlaku di mana-mana:
 * **frasa terpanjang menang** (§6.5). Gak ada skor, gak ada ambang batas —
 * kalau dua frasa sama-sama cocok, yang lebih panjang yang dipakai. Titik.
 */

const LEAD_PUNCT = /^[,;:.?!"'`(]+/;
const TAIL_PUNCT = /[,;:.?!"'`)]+$/;

/** Kalimat → deretan kata ternormalisasi (huruf kecil, tanpa tanda baca tepi). */
export function words(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(LEAD_PUNCT, "").replace(TAIL_PUNCT, ""))
    .filter((w) => w !== "");
}

/** Cocokkan satu frasa mulai dari indeks i. Balikin jumlah kata, atau 0. */
export function matchPhrase(ws: readonly string[], i: number, phrase: string): number {
  const parts = phrase.split(" ");
  for (let k = 0; k < parts.length; k++) {
    if (ws[i + k] !== parts[k]) return 0;
  }
  return parts.length;
}

/** Frasa terpanjang dari sebuah daftar yang cocok di indeks i. */
export function findLongest(
  ws: readonly string[],
  i: number,
  phrases: readonly string[],
): { phrase: string; len: number } | null {
  let best: { phrase: string; len: number } | null = null;
  for (const p of phrases) {
    const len = matchPhrase(ws, i, p);
    if (len > 0 && (best === null || len > best.len)) best = { phrase: p, len };
  }
  return best;
}

/**
 * Sama seperti findLongest, tapi di atas beberapa daftar sekaligus — balikin
 * juga daftar mana yang menang. Dipakai buat verba, status, dan grup topik
 * yang semuanya berbentuk `{ kunci: [sinonim...] }`.
 */
export function findLongestIn<K extends string>(
  ws: readonly string[],
  i: number,
  groups: Record<K, readonly string[]>,
): { key: K; phrase: string; len: number } | null {
  let best: { key: K; phrase: string; len: number } | null = null;
  for (const key of Object.keys(groups) as K[]) {
    const hit = findLongest(ws, i, groups[key]);
    if (hit && (best === null || hit.len > best.len)) {
      best = { key, phrase: hit.phrase, len: hit.len };
    }
  }
  return best;
}

/** Pindai seluruh kalimat, balikin kecocokan pertama beserta posisinya. */
export function scan<T>(
  ws: readonly string[],
  read: (ws: readonly string[], i: number) => (T & { len: number }) | null,
): (T & { len: number; at: number }) | null {
  for (let i = 0; i < ws.length; i++) {
    const hit = read(ws, i);
    if (hit) return { ...hit, at: i };
  }
  return null;
}
