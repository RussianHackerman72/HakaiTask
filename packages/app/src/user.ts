/**
 * Identitas lokal — dipakai selagi Supabase belum dikonfigurasi (atau belum
 * login). App-nya tetep jalan penuh offline; yang gak ada cuma sync.
 *
 * Sengaja dipisah dari lapisan auth: web bikin ini di `AuthGate`, mobile
 * butuhnya sebelum layar auth ada sama sekali. Kuncinya sama supaya satu
 * device gak tiba-tiba ganti pemilik data pas auth-nya nyusul.
 */
import { platform } from "./platform.js";

const KEY = "hakaitask-local-user";

/** Bikin sekali, lalu dipakai selamanya di device ini. */
export function localUserId(): string {
  const existing = platform().kv.get(KEY);
  if (existing) return existing;
  const id = platform().uuid();
  platform().kv.set(KEY, id);
  return id;
}

/**
 * Sapaan default sebelum login — dipakai `openingMessage()` dan balasan chat.
 *
 * Ini VOKATIF, bukan nama. Dulu isinya "Kai", dan itu nama orang — nama yang
 * bikin judul app-nya. Jadi tiap orang yang belum login disapa pakai nama
 * pembuatnya: "Selamat malam, Kai." Kelihatan kayak app-nya salah kira, dan
 * buat orang lain emang salah beneran.
 *
 * "Bos" dipilih karena dia nyapa tanpa ngaku-ngaku tau: sopan, santai, dan
 * cocok sama laras app-nya yang pakai gue/lu. Ejaannya satu s — "Boss" itu
 * Inggris, dan di tengah kalimat Indonesia kebaca sumbang.
 *
 * Begitu login, `displayName()` ngambil nama asli dari `full_name` atau
 * bagian depan email — jadi yang ini cuma kepakai selama belum ada yang tau
 * siapa orangnya.
 */
export const DEFAULT_USER_NAME = "Bos";
