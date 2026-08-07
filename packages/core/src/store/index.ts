/**
 * Store Zustand — PLAN.md §2.3 & §6.8
 *
 * Adapter penyimpanan disuntik dari luar (localStorage di web,
 * AsyncStorage di mobile) supaya core tetap bebas platform.
 */
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { BusyBlock, Energy, Project, Task, UserSettings } from "../types.js";
import { DEFAULT_SETTINGS } from "../types.js";
import {
  ack,
  emptyOutbox,
  enqueue,
  fail,
  lockedFieldsFor,
  mergeLWW,
  type Mutation,
  type OutboxState,
} from "../sync/index.js";

export interface KaiState {
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  busyBlocks: Record<string, BusyBlock>;
  settings: UserSettings | null;
  fieldTimes: Record<string, Record<string, string>>;
  outbox: OutboxState;
  online: boolean;
  hydrated: boolean;

  upsertTask: (task: Task, fields?: string[]) => void;
  patchTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  /** Terapkan baris dari server ke store lokal, LWW per field (§6.8). */
  mergeRemoteTask: (remote: Task, remoteAt: string) => void;
  upsertBusyBlock: (block: BusyBlock) => void;
  removeBusyBlock: (id: string) => void;
  setSettings: (settings: UserSettings) => void;
  setHydrated: () => void;
  setOnline: (online: boolean) => void;
  ackMutation: (id: string) => void;
  failMutation: (id: string) => void;
  energyMode: () => Energy | "auto";
}

let storageAdapter: StateStorage | undefined;

function requireAdapter(): StateStorage {
  if (!storageAdapter) {
    throw new Error("configureStorage() belum dipanggil — panggil sebelum store dipakai.");
  }
  return storageAdapter;
}

/**
 * Adapter dibaca per panggilan, bukan sekali di awal: modul ini dievaluasi
 * saat di-import, jauh sebelum app sempat manggil configureStorage().
 */
const lazyStorage: StateStorage = {
  getItem: (name) => requireAdapter().getItem(name),
  setItem: (name, value) => requireAdapter().setItem(name, value),
  removeItem: (name) => requireAdapter().removeItem(name),
};

/**
 * Panggil sekali saat boot. Hydration sengaja ditunda sampai di sini
 * (`skipHydration`) — kalau enggak, persist bakal nyoba baca storage pas
 * modul di-import dan gagal diam-diam, bikin app nyangkut sebelum render.
 */
export function configureStorage(adapter: StateStorage): Promise<void> {
  storageAdapter = adapter;
  return useKaiStore.persist.rehydrate() ?? Promise.resolve();
}

function nowIso(): string {
  return new Date().toISOString();
}

function stampFields(keys: string[], at: string): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, at]));
}

function mutation(
  entityId: string,
  op: Mutation["op"],
  payload: Record<string, unknown>,
  at: string,
): Mutation {
  return {
    id: `${entityId}:${at}:${Math.random().toString(36).slice(2, 8)}`,
    entity: "task",
    entityId,
    op,
    payload,
    fieldTimes: stampFields(Object.keys(payload), at),
    createdAt: at,
    attempts: 0,
  };
}

export const useKaiStore = create<KaiState>()(
  persist(
    (set, get) => ({
      tasks: {},
      projects: {},
      busyBlocks: {},
      settings: null,
      fieldTimes: {},
      outbox: emptyOutbox(),
      online: true,
      hydrated: false,

      upsertTask: (task, fields) => {
        const at = nowIso();
        const keys = fields ?? Object.keys(task);
        set((s) => ({
          tasks: { ...s.tasks, [task.id]: task },
          fieldTimes: {
            ...s.fieldTimes,
            [task.id]: { ...s.fieldTimes[task.id], ...stampFields(keys, at) },
          },
          outbox: enqueue(
            s.outbox,
            mutation(task.id, s.tasks[task.id] ? "update" : "create", { ...task }, at),
          ),
        }));
      },

      patchTask: (id, patch) => {
        const current = get().tasks[id];
        if (!current) return;
        const at = nowIso();
        const next: Task = { ...current, ...patch, updatedAt: at };
        set((s) => ({
          tasks: { ...s.tasks, [id]: next },
          fieldTimes: {
            ...s.fieldTimes,
            [id]: { ...s.fieldTimes[id], ...stampFields(Object.keys(patch), at) },
          },
          outbox: enqueue(s.outbox, mutation(id, "update", { ...patch }, at)),
        }));
      },

      /** Tombstone, bukan hapus beneran — biar hapus di HP gak "hidup lagi". */
      removeTask: (id) => {
        const at = nowIso();
        set((s) => {
          const current = s.tasks[id];
          if (!current) return s;
          return {
            tasks: { ...s.tasks, [id]: { ...current, deletedAt: at, updatedAt: at } },
            outbox: enqueue(s.outbox, mutation(id, "delete", { deletedAt: at }, at)),
          };
        });
      },

      /**
       * Server gak nyimpen waktu per field — dia cuma punya satu `updatedAt`
       * per baris. Jadi waktu itu dipakai buat semua field yang dikirim, dan
       * field yang masih nunggu di outbox dikunci supaya gak ketimpa.
       */
      mergeRemoteTask: (remote, remoteAt) => {
        set((s) => {
          const local = s.tasks[remote.id];
          if (!local) {
            return {
              tasks: { ...s.tasks, [remote.id]: remote },
              fieldTimes: {
                ...s.fieldTimes,
                [remote.id]: stampFields(Object.keys(remote), remoteAt),
              },
            };
          }
          const { merged, times } = mergeLWW(
            local as unknown as Record<string, unknown>,
            remote as unknown as Record<string, unknown>,
            s.fieldTimes[remote.id] ?? {},
            stampFields(Object.keys(remote), remoteAt),
            lockedFieldsFor(s.outbox, remote.id),
          );
          return {
            tasks: { ...s.tasks, [remote.id]: merged as unknown as Task },
            fieldTimes: { ...s.fieldTimes, [remote.id]: times },
          };
        });
      },

      /**
       * Busy block masih lokal murni — sync-nya nyusul bareng time blocking
       * di Fase 4 (§6.2). Sengaja gak masuk outbox biar antreannya gak keisi
       * mutasi yang belum ada penanganannya di sisi kirim.
       */
      upsertBusyBlock: (block) =>
        set((s) => ({ busyBlocks: { ...s.busyBlocks, [block.id]: block } })),

      removeBusyBlock: (id) =>
        set((s) => {
          const next = { ...s.busyBlocks };
          delete next[id];
          return { busyBlocks: next };
        }),

      setSettings: (settings) => set({ settings }),
      setHydrated: () => set({ hydrated: true }),
      setOnline: (online) => set({ online }),
      ackMutation: (id) => set((s) => ({ outbox: ack(s.outbox, id) })),
      failMutation: (id) => set((s) => ({ outbox: fail(s.outbox, id) })),
      energyMode: () => get().settings?.energyMode ?? DEFAULT_SETTINGS.energyMode,
    }),
    {
      name: "hakaitask",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => lazyStorage),
      partialize: (s) => ({
        tasks: s.tasks,
        projects: s.projects,
        busyBlocks: s.busyBlocks,
        settings: s.settings,
        fieldTimes: s.fieldTimes,
        outbox: s.outbox,
      }),
      // Wajib lewat action, bukan mutasi langsung ke objek state: mutasi
      // in-place gak nge-notify subscriber, jadi UI bakal nyangkut di layar
      // kosong selamanya. Dipanggil juga saat gagal baca storage supaya app
      // tetap jalan (offline-first, §6.8).
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn("[store] gagal baca penyimpanan lokal", error);
        if (state) {
          state.setHydrated();
          return;
        }
        // Storage rusak/diblokir: app tetap harus jalan, jangan nyangkut di
        // layar kosong. Ditunda satu microtask karena callback ini bisa
        // kepanggil sebelum `useKaiStore` selesai diinisialisasi.
        queueMicrotask(() => useKaiStore.getState().setHydrated());
      },
    },
  ),
);
