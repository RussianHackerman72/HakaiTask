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
  setOnline: (online: boolean) => void;
  ackMutation: (id: string) => void;
  failMutation: (id: string) => void;
  energyMode: () => Energy | "auto";
}

let storageAdapter: StateStorage | undefined;

/** Panggil sekali saat boot, sebelum store dipakai. */
export function configureStorage(adapter: StateStorage): void {
  storageAdapter = adapter;
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

      setOnline: (online) => set({ online }),
      ackMutation: (id) => set((s) => ({ outbox: ack(s.outbox, id) })),
      failMutation: (id) => set((s) => ({ outbox: fail(s.outbox, id) })),
      energyMode: () => get().settings?.energyMode ?? DEFAULT_SETTINGS.energyMode,
    }),
    {
      name: "kaitask",
      version: 1,
      storage: createJSONStorage(() => {
        if (!storageAdapter) {
          throw new Error(
            "configureStorage() belum dipanggil — panggil sebelum store dipakai.",
          );
        }
        return storageAdapter;
      }),
      partialize: (s) => ({
        tasks: s.tasks,
        projects: s.projects,
        busyBlocks: s.busyBlocks,
        settings: s.settings,
        fieldTimes: s.fieldTimes,
        outbox: s.outbox,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
