/**
 * Setelan pengguna — pembaca & penulisnya.
 *
 * `UserSettings` sama `DEFAULT_SETTINGS` udah ada di core dari dulu, dan
 * `setSettings` udah ada di store — tapi GAK ADA satu pun yang manggil.
 * Semua pemakainya (penjadwal notifikasi, timer fokus, layout akar) selama
 * ini jatuh ke `DEFAULT_SETTINGS`, jadi setelan itu tipe yang kosong isinya.
 * Berkas ini penulis pertamanya.
 *
 * Sengaja DEVICE-LOCAL: `settings` ikut disimpan lokal (ada di `partialize`)
 * tapi gak pernah masuk outbox dan gak punya kolom di `mapping.ts`. Alasannya
 * bukan malas — sebagian isinya emang cuma masuk akal per perangkat (jam
 * tenang HP kerja beda sama HP pribadi), dan nyinkronin sisanya berarti
 * bikin tabel plus migrasi buat sesuatu yang belum tentu diminta.
 */
import { useMemo } from "react";
import { DEFAULT_SETTINGS, type UserSettings } from "@hakaitask/core";
import { useKaiStore } from "@hakaitask/core/store";

/**
 * Setelan yang KEPAKAI sekarang — gak pernah null.
 *
 * Yang belum pernah disetel jatuh ke bawaan, jadi pemanggilnya gak usah
 * mikirin dua bentuk. Ini juga yang bikin layar setelan bisa nampilin nilai
 * bawaan apa adanya, bukan kolom kosong yang artinya nebak-nebak.
 */
export function useSettings(userId: string): UserSettings {
  const stored = useKaiStore((s) => s.settings);
  return useMemo(
    () => stored ?? { ...DEFAULT_SETTINGS, userId },
    [stored, userId],
  );
}

/** Baca sekali di luar React — buat pemanggil yang bukan komponen. */
export function readSettings(userId: string): UserSettings {
  return useKaiStore.getState().settings ?? { ...DEFAULT_SETTINGS, userId };
}

/**
 * Ubah sebagian. Ditulis penuh ke store, bukan digabung di pemanggil — kalau
 * tiap layar nggabung sendiri, cepat atau lambat ada satu yang nimpa field
 * yang gak dia sentuh sama nilai bawaan.
 */
export function patchSettings(patch: Partial<UserSettings>, userId: string): void {
  const now = readSettings(userId);
  useKaiStore.getState().setSettings({ ...now, ...patch, userId });
}
