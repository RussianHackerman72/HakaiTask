/**
 * Adapter penyimpanan web buat store di `packages/core`.
 * Core gak boleh nyentuh DOM/localStorage langsung (§2.2), jadi disuntik dari sini.
 */
import type { StateStorage } from "zustand/middleware";

const memory = new Map<string, string>();

function available(): boolean {
  try {
    const probe = "__hakaitask_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Fallback ke memori kalau localStorage diblokir (private mode / storage penuh). */
export const webStorage: StateStorage = available()
  ? {
      getItem: (name) => window.localStorage.getItem(name),
      setItem: (name, value) => window.localStorage.setItem(name, value),
      removeItem: (name) => window.localStorage.removeItem(name),
    }
  : {
      getItem: (name) => memory.get(name) ?? null,
      setItem: (name, value) => void memory.set(name, value),
      removeItem: (name) => void memory.delete(name),
    };
