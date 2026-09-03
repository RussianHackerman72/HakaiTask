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

/** Nama sapaan default — dipakai `openingMessage()` dan balasan chat. */
export const DEFAULT_USER_NAME = "Kai";
