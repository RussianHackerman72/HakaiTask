/**
 * Store Zustand — PLAN.md §2.3 & §6.8
 *
 * Adapter penyimpanan disuntik dari luar (localStorage di web,
 * AsyncStorage di mobile) supaya core tetap bebas platform.
 */
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type {
  BusyBlock,
  Energy,
  Project,
  Task,
  UserLexiconEntry,
  UserSettings,
} from "../types.js";
import { DEFAULT_SETTINGS } from "../types.js";
import {
  ack,
  emptyOutbox,
  enqueue,
  fail,
  lockedFieldsFor,
  mergeLWW,
  retryDeadLetter,
  type Mutation,
  type OutboxState,
} from "../sync/index.js";

export interface KaiState {
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  busyBlocks: Record<string, BusyBlock>;
  /** Kamus pribadi, dikunci per `id` (PLAN-VOCAB §8). */
  lexicon: Record<string, UserLexiconEntry>;
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
  /** Terapkan baris jadwal dari server (LWW sederhana per baris). */
  mergeRemoteBlock: (remote: BusyBlock) => void;
  upsertLexicon: (entry: UserLexiconEntry) => void;
  removeLexicon: (id: string) => void;
  mergeRemoteLexicon: (remote: UserLexiconEntry) => void;
  setSettings: (settings: UserSettings) => void;
  setHydrated: () => void;
  setOnline: (online: boolean) => void;
  ackMutation: (id: string) => void;
  failMutation: (id: string) => void;
  retryDeadLetter: () => void;
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
  entity: Mutation["entity"] = "task",
): Mutation {
  return {
    id: `${entityId}:${at}:${Math.random().toString(36).slice(2, 8)}`,
    entity,
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
      lexicon: {},
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
       * Jadwal ikut sync sejak keputusan P1 (PLAN-CHAT). Sebelumnya dia lokal
       * murni — dan itu bikin fitur chat yang berpusat di jadwal jadi setengah
       * jalan: dibikin di HP, ilang di laptop.
       */
      upsertBusyBlock: (block) => {
        const at = nowIso();
        const next: BusyBlock = { ...block, updatedAt: at };
        set((s) => ({
          busyBlocks: { ...s.busyBlocks, [block.id]: next },
          outbox: enqueue(
            s.outbox,
            mutation(block.id, s.busyBlocks[block.id] ? "update" : "create", { ...next }, at, "busy_block"),
          ),
        }));
      },

      /** Tombstone, bukan hapus beneran — alasannya sama seperti task. */
      removeBusyBlock: (id) => {
        const at = nowIso();
        set((s) => {
          const current = s.busyBlocks[id];
          if (!current) return s;
          return {
            busyBlocks: { ...s.busyBlocks, [id]: { ...current, deletedAt: at, updatedAt: at } },
            outbox: enqueue(s.outbox, mutation(id, "delete", { deletedAt: at }, at, "busy_block")),
          };
        });
      },

      /**
       * Jadwal pakai LWW per BARIS, bukan per field seperti task. Bedanya
       * disengaja: sebuah blok waktu itu satu kesatuan — `startAt` dan `endAt`
       * yang nyampur dari dua device bisa bikin jadwal yang berakhir sebelum
       * dimulai.
       */
      mergeRemoteBlock: (remote) =>
        set((s) => {
          const local = s.busyBlocks[remote.id];
          if (local?.updatedAt && remote.updatedAt && local.updatedAt > remote.updatedAt) return s;
          return { busyBlocks: { ...s.busyBlocks, [remote.id]: remote } };
        }),

      upsertLexicon: (entry) => {
        const at = nowIso();
        const next: UserLexiconEntry = { ...entry, updatedAt: at };
        set((s) => ({
          lexicon: { ...s.lexicon, [entry.id]: next },
          outbox: enqueue(
            s.outbox,
            mutation(entry.id, s.lexicon[entry.id] ? "update" : "create", { ...next }, at, "lexicon"),
          ),
        }));
      },

      removeLexicon: (id) => {
        const at = nowIso();
        set((s) => {
          const current = s.lexicon[id];
          if (!current) return s;
          return {
            lexicon: { ...s.lexicon, [id]: { ...current, deletedAt: at, updatedAt: at } },
            outbox: enqueue(s.outbox, mutation(id, "delete", { deletedAt: at }, at, "lexicon")),
          };
        });
      },

      mergeRemoteLexicon: (remote) =>
        set((s) => {
          const local = s.lexicon[remote.id];
          if (local?.updatedAt && remote.updatedAt && local.updatedAt > remote.updatedAt) return s;
          return { lexicon: { ...s.lexicon, [remote.id]: remote } };
        }),

      setSettings: (settings) => set({ settings }),
      setHydrated: () => set({ hydrated: true }),
      setOnline: (online) => set({ online }),
      ackMutation: (id) => set((s) => ({ outbox: ack(s.outbox, id) })),
      failMutation: (id) => set((s) => ({ outbox: fail(s.outbox, id) })),
      retryDeadLetter: () => set((s) => ({ outbox: retryDeadLetter(s.outbox) })),
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
        lexicon: s.lexicon,
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
