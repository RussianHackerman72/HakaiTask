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

export function useGuardSettings(): { dnd: boolean; setDnd: (v: boolean) => void } {
  const dnd = useSyncExternalStore(subscribe, snapshotDnd, snapshotDnd);
  const setDnd = useCallback((v: boolean) => {
    dndCache = v;
    platform().kv.set(DND_KEY, v ? "1" : "0");
    emit();
  }, []);
  return { dnd, setDnd };
}

/** Dipanggil pas sesi kerja mulai. Diam aja kalau gak ada yang diblokir. */
export function startGuard(title: string, endsAt: string | undefined): void {
  const blocked = snapshotBlocked();
  if (blocked.length === 0) return;
  try {
    FocusGuard.startGuard({
      blocked,
      title,
      endsAt: endsAt ? Date.parse(endsAt) : null,
      dnd: snapshotDnd(),
    });
  } catch {
    // Modul native gak ada (misal build lama) — sesinya tetap jalan.
  }
}

export function stopGuard(): void {
  try {
    FocusGuard.stopGuard();
  } catch {
    /* diabaikan */
  }
}
