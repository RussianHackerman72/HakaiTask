/**
 * Offline-first: outbox queue + resolusi konflik — PLAN.md §6.8
 *
 * Semua mutasi ditulis ke store lokal dulu (optimistik), lalu masuk outbox.
 * Konflik diselesaikan last-write-wins PER FIELD, bukan per baris — supaya
 * edit `title` di HP dan `dueAt` di web dua-duanya selamat.
 */
import type { ISODate } from "../types.js";

export type MutationOp = "create" | "update" | "delete";
export type EntityKind = "task" | "project" | "busy_block" | "settings" | "focus_session";

export interface Mutation<T = Record<string, unknown>> {
  id: string;
  entity: EntityKind;
  entityId: string;
  op: MutationOp;
  payload: Partial<T>;
  /** Waktu per field — dasar resolusi LWW. */
  fieldTimes: Record<string, ISODate>;
  createdAt: ISODate;
  attempts: number;
}

export const MAX_ATTEMPTS = 10;

export interface OutboxState {
  queue: Mutation[];
  deadLetter: Mutation[];
}

export function emptyOutbox(): OutboxState {
  return { queue: [], deadLetter: [] };
}

export function enqueue<T>(state: OutboxState, mutation: Mutation<T>): OutboxState {
  return { ...state, queue: [...state.queue, mutation as Mutation] };
}

export function ack(state: OutboxState, mutationId: string): OutboxState {
  return { ...state, queue: state.queue.filter((m) => m.id !== mutationId) };
}

/** Gagal jaringan: naikkan attempts, pindah ke dead-letter kalau lewat batas. */
export function fail(state: OutboxState, mutationId: string): OutboxState {
  const queue: Mutation[] = [];
  const deadLetter = [...state.deadLetter];
  for (const m of state.queue) {
    if (m.id !== mutationId) {
      queue.push(m);
      continue;
    }
    const next = { ...m, attempts: m.attempts + 1 };
    if (next.attempts > MAX_ATTEMPTS) deadLetter.push(next);
    else queue.push(next);
  }
  return { queue, deadLetter };
}

/** Backoff eksponensial 1s → 60s. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 60_000);
}

export function pendingCount(state: OutboxState): number {
  return state.queue.length;
}

export function isPending(state: OutboxState, entityId: string): boolean {
  return state.queue.some((m) => m.entityId === entityId);
}

/**
 * Gabungkan record remote ke local dengan LWW per field.
 * Field yang sedang menunggu di outbox SELALU menang — perubahan lokal yang
 * belum terkirim tidak boleh ditimpa data server.
 */
export function mergeLWW<T extends Record<string, unknown>>(
  local: T,
  remote: T,
  localTimes: Record<string, ISODate>,
  remoteTimes: Record<string, ISODate>,
  lockedFields: ReadonlySet<string> = new Set(),
): { merged: T; times: Record<string, ISODate> } {
  const merged = { ...local } as Record<string, unknown>;
  const times = { ...localTimes };

  for (const key of Object.keys(remote)) {
    if (lockedFields.has(key)) continue;
    const lt = localTimes[key];
    const rt = remoteTimes[key];
    if (rt === undefined) continue;
    if (lt === undefined || new Date(rt).getTime() > new Date(lt).getTime()) {
      merged[key] = remote[key];
      times[key] = rt;
    }
  }
  return { merged: merged as T, times };
}

/** Field yang lagi nunggu kirim buat satu entitas — dipakai sebagai lock di atas. */
export function lockedFieldsFor(state: OutboxState, entityId: string): Set<string> {
  const locked = new Set<string>();
  for (const m of state.queue) {
    if (m.entityId !== entityId) continue;
    for (const key of Object.keys(m.payload)) locked.add(key);
  }
  return locked;
}

export type SyncIndicator = "synced" | "pending" | "offline" | "conflict";

export function syncIndicator(state: OutboxState, online: boolean): {
  status: SyncIndicator;
  count: number;
} {
  if (state.deadLetter.length > 0) return { status: "conflict", count: state.deadLetter.length };
  if (!online) return { status: "offline", count: state.queue.length };
  if (state.queue.length > 0) return { status: "pending", count: state.queue.length };
  return { status: "synced", count: 0 };
}
