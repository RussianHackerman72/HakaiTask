/**
 * Resolusi target & ambiguitas — PLAN-CHAT.md §8
 *
 * Perintah kayak "ubah meeting gw besok" nunjuk ke sesuatu tanpa nyebut yang
 * mana. Modul ini yang mutusin: langsung jalan, tanya dulu, atau nyerah.
 * Aturannya sengaja kaku — sistem gak pernah milih sendiri kalau ada lebih
 * dari satu kandidat.
 */
import type { QueryContext, QueryFilter } from "./query.js";
import { queryItems, taskTime } from "./query.js";

export interface Ref {
  kind: "task" | "busy";
  id: string;
  title: string;
  /** ISO waktu kejadian — buat ditampilin di daftar pilihan. */
  at?: string;
}

export type Resolution =
  | { kind: "none" }
  | { kind: "one"; ref: Ref }
  | { kind: "many"; refs: Ref[] }
  | { kind: "too_many"; count: number };

/** Di atas ini, milih dari daftar malah lebih repot daripada ngetik ulang. */
export const MAX_CHOICES = 8;

export function resolveTarget(ctx: QueryContext, filter: QueryFilter): Resolution {
  // Sengaja gak pakai potongan RESULT_CAP: buat resolusi kita butuh jumlah
  // sebenarnya, bukan sepuluh teratas.
  const res = queryItems(ctx, filter);

  const refs: Ref[] = [
    ...res.tasks.map((t): Ref => ({
      kind: "task",
      id: t.id,
      title: t.title,
      ...(taskTime(t) ? { at: taskTime(t)! } : {}),
    })),
    ...res.occurrences.map((o): Ref => ({
      kind: "busy",
      id: o.block.id,
      title: o.block.title,
      at: o.startAt,
    })),
  ];

  if (res.total === 0) return { kind: "none" };
  if (res.total > MAX_CHOICES) return { kind: "too_many", count: res.total };
  if (refs.length === 1) return { kind: "one", ref: refs[0]! };
  return { kind: "many", refs };
}

/**
 * Kandidat divalidasi ULANG saat mau dieksekusi, bukan cuma pas ditawarkan.
 * Antara sistem nanya "yang mana?" dan user jawab, sync dari device lain bisa
 * ngubah atau ngapus datanya (§8.1, E13).
 */
export function stillExists(ctx: QueryContext, ref: Ref): boolean {
  if (ref.kind === "task") {
    return ctx.tasks.some((t) => t.id === ref.id && !t.deletedAt);
  }
  return ctx.blocks.some((b) => b.id === ref.id);
}
