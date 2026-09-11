/**
 * Seleksi murni dari isi store.
 *
 * Sengaja dipisah dari hook-nya (`tasks.ts`, `chat.ts`): isinya jadi bisa diuji
 * di node tanpa renderer sama sekali — sama kayak seluruh `packages/core`.
 * Hook-nya tinggal jadi pembungkus `useMemo` satu baris.
 */
import type { BusyBlock, Task, UserLexiconEntry } from "@hakaitask/core";
import type { VocabEntry } from "@hakaitask/core/chat";

/** Task hidup: tombstone dan arsip disaring di sini, bukan di tiap komponen. */
export function selectTasks(map: Record<string, Task>): Task[] {
  return Object.values(map).filter((t) => !t.deletedAt && t.status !== "archived");
}

/**
 * Kebalikan `selectTasks`: yang diarsipin DOANG.
 *
 * Diarsipin itu bukan dihapus, tapi sebelum ada layar arsip efeknya sama aja —
 * task-nya ilang dari chat, dari papan, dari notifikasi, dan gak ada satu pun
 * tempat buat ngeliatnya lagi. Sekali jalan, tanpa jalan balik.
 *
 * Tombstone (`deletedAt`) tetap disaring di sini. Yang kehapus beneran gak
 * punya layar, dan emang gak usah punya — itu beda maksud dari diarsipin.
 *
 * Urut dari yang paling baru diarsipin, karena yang paling mungkin dicari
 * balik itu yang barusan.
 */
export function selectArchived(map: Record<string, Task>): Task[] {
  return Object.values(map)
    .filter((t) => !t.deletedAt && t.status === "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Jadwal sekarang dihapus pakai tombstone (biar sync-nya jujur), jadi yang
 * udah dihapus harus disaring di sini — persis kayak task.
 */
export function selectBusyBlocks(map: Record<string, BusyBlock>): BusyBlock[] {
  return Object.values(map)
    .filter((b) => !b.deletedAt)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Bentuk store (`dari`/`ke`) → bentuk mesin chat (`phrase`/`meaning`). */
export function selectVocab(map: Record<string, UserLexiconEntry>): VocabEntry[] {
  return Object.values(map)
    .filter((v) => !v.deletedAt)
    .map((v) => ({ id: v.id, phrase: v.dari, meaning: v.ke, type: v.tipe }));
}
