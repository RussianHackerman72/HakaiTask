/**
 * Setelan penjaga fokus + sambungannya ke sesi.
 *
 * Disimpan di KV, bukan di store yang disinkronkan: daftar app yang diblokir
 * itu urusan device ini. Paket yang kepasang di HP belum tentu ada di HP lain,
 * dan nyinkronin daftar itu cuma bikin blocklist berisi app yang gak ada.
 */
import { useCallback, useSyncExternalStore } from "react";
import { platform } from "@hakaitask/app";
import { FocusGuard } from "../modules/focus-guard";

const BLOCKED_KEY = "hakaitask-guard-blocked";
const DND_KEY = "hakaitask-guard-dnd";
const STRICT_KEY = "hakaitask-guard-strict";
const GRACE_KEY = "hakaitask-guard-grace";

/**
 * 15 detik. Cukup lama buat ngintip notifikasi, ngangkat telepon, atau ngecek
 * jam di beranda tanpa ketemu tembok; cukup pendek buat kena scroll yang
 * beneran nyasar.
 */
const DEFAULT_GRACE_SEC = 15;
const MIN_GRACE_SEC = 5;

// Store luar yang mini — biar layar setup dan timer lihat nilai yang sama.
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

function readBlocked(): string[] {
  try {
    const raw = platform().kv.get(BLOCKED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// useSyncExternalStore butuh referensi yang STABIL — bikin array baru tiap
// panggilan bikin React render tanpa henti.
let blockedCache: string[] = readBlocked();
let blockedJson = JSON.stringify(blockedCache);

function snapshotBlocked(): string[] {
  return blockedCache;
}

function writeBlocked(next: string[]): void {
  const json = JSON.stringify(next);
  if (json === blockedJson) return;
  blockedJson = json;
  blockedCache = next;
  platform().kv.set(BLOCKED_KEY, json);
  emit();
}

export function useBlocklist(): {
  blocked: string[];
  toggle: (pkg: string) => void;
} {
  const blocked = useSyncExternalStore(subscribe, snapshotBlocked, snapshotBlocked);

  const toggle = useCallback((pkg: string) => {
    const cur = snapshotBlocked();
    writeBlocked(cur.includes(pkg) ? cur.filter((p) => p !== pkg) : [...cur, pkg]);
  }, []);

  return { blocked, toggle };
}

let dndCache = platform().kv.get(DND_KEY) === "1";
function snapshotDnd(): boolean {
  return dndCache;
}

/**
 * Mode ketat MATI kalau gak ada catatannya. Bukan bawaan yang kebetulan —
 * fitur yang bisa nahan app apa pun jangan pernah nyala tanpa diminta.
 */
let strictCache = platform().kv.get(STRICT_KEY) === "1";
function snapshotStrict(): boolean {
  return strictCache;
}

let graceCache = Number(platform().kv.get(GRACE_KEY) ?? "") || DEFAULT_GRACE_SEC;
function snapshotGrace(): number {
  return graceCache;
}

export function useGuardSettings(): {
  dnd: boolean;
  setDnd: (v: boolean) => void;
  strict: boolean;
  setStrict: (v: boolean) => void;
  graceSec: number;
  setGraceSec: (v: number) => void;
} {
  const dnd = useSyncExternalStore(subscribe, snapshotDnd, snapshotDnd);
  const strict = useSyncExternalStore(subscribe, snapshotStrict, snapshotStrict);
  const graceSec = useSyncExternalStore(subscribe, snapshotGrace, snapshotGrace);

  const setDnd = useCallback((v: boolean) => {
    dndCache = v;
    platform().kv.set(DND_KEY, v ? "1" : "0");
    emit();
  }, []);

  const setStrict = useCallback((v: boolean) => {
    strictCache = v;
    platform().kv.set(STRICT_KEY, v ? "1" : "0");
    emit();
  }, []);

  const setGraceSec = useCallback((v: number) => {
    const clamped = Math.max(MIN_GRACE_SEC, Math.round(v));
    graceCache = clamped;
    platform().kv.set(GRACE_KEY, String(clamped));
    emit();
  }, []);

  return { dnd, setDnd, strict, setStrict, graceSec, setGraceSec };
}

/**
 * Hasil nyalain penjaga — sengaja dibalikin, bukan disimpen diam-diam.
 *
 *   "menjaga"     beneran ngeblokir
 *   "kosong"      gak ada app yang dipilih — sesi & notifikasinya tetap jalan
 *   "tanpa-izin"  ada blocklist TAPI izin aksesibilitasnya mati
 *   "gagal"       modul native-nya gak ada / error
 *
 * Cuma dua yang terakhir yang perlu diomongin ke user. "kosong" itu pilihan
 * yang sah: timer sama notifikasinya jalan penuh, cuma gak ada yang ditahan.
 */
export type GuardStatus = "menjaga" | "kosong" | "tanpa-izin" | "gagal";

/**
 * Dipanggil pas sesi kerja mulai.
 *
 * Dulu fungsi ini cuma ngecek blocklist-nya kosong atau enggak, terus manggil
 * `startGuard` — TANPA sekali pun nanya apakah izin aksesibilitasnya nyala.
 * Kalau mati: layanannya tetap jalan, notifikasi ongoing-nya tetap nongol,
 * timernya tetap jalan, dan gak ada satu app pun yang keblokir. Sesinya
 * KELIHATAN dijaga padahal enggak.
 *
 * Itu bukan bug kecil. Satu-satunya hal yang dijanjiin fitur ini adalah
 * "app pengalih perhatian bakal ketahan", dan diem-diem gak nepatin itu lebih
 * buruk daripada gak nawarin sama sekali — user baru sadar setelah sejam
 * kebuang.
 */
export function startGuard(
  title: string,
  endsAt: string | undefined,
  taskId?: string,
): GuardStatus {
  const blocked = snapshotBlocked();

  try {
    /**
     * Layanannya jalan SETIAP sesi, bukan cuma pas ada yang diblokir.
     *
     * Dulu blocklist kosong = pulang duluan, jadi gak ada layanan dan gak ada
     * notifikasi ongoing. Padahal notifikasi itu bukan bagian dari
     * pemblokiran — dia yang bikin timernya kelihatan pas layar dikunci, dan
     * yang bikin sesi bisa dijeda tanpa buka app. Orang yang gak ngeblokir
     * app satu pun tetap butuh itu.
     *
     * Yang digerbang blocklist cuma pemblokirannya sendiri, dan itu diurus
     * `GuardState` di sisi Kotlin: himpunan kosong = `shouldBlock` selalu
     * false.
     */
    // Mode ketat sama daftar blokir sama-sama nyandar ke AccessibilityService,
    // jadi dua-duanya mati kalau izinnya gak ada.
    const a11y = FocusGuard.isAccessibilityEnabled();
    const strict = snapshotStrict();
    const blokirJalan = a11y && (blocked.length > 0 || strict);

    FocusGuard.startGuard({
      blocked: a11y ? blocked : [],
      title,
      ...(taskId ? { taskId } : {}),
      endsAt: endsAt ? Date.parse(endsAt) : null,
      dnd: snapshotDnd(),
      strict: a11y && strict,
      graceSec: snapshotGrace(),
    });

    if (blocked.length === 0 && !strict) return "kosong";
    return blokirJalan ? "menjaga" : "tanpa-izin";
  } catch (e) {
    // Modul native gak ada (misal build lama) — sesinya tetap jalan, tapi
    // jangan ditelen bulat-bulat: dulu modul yang beneran rusak kelihatan
    // persis kayak modul yang sengaja gak dipakai.
    if (__DEV__) console.warn("[guard] startGuard gagal:", e);
    return "gagal";
  }
}

export function stopGuard(): void {
  try {
    FocusGuard.stopGuard();
  } catch (e) {
    if (__DEV__) console.warn("[guard] stopGuard gagal:", e);
  }
}
