/**
 * `createTask` — jalan bikin task yang GAK lewat parser.
 *
 * Yang paling penting diuji di sini bukan "task-nya kebikin", tapi field mana
 * yang GAK boleh nembus dari luar. `actualMin` khususnya: dia cache yang
 * dihitung ulang dari sesi fokus, dan kalau bisa diisi tangan, laporan
 * waktunya bohong tanpa ada yang tau sampai ada sesi baru yang nimpa.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { configureStorage, useKaiStore } from "@hakaitask/core/store";
import { emptyOutbox } from "@hakaitask/core/sync";
import { configurePlatform, type PlatformAdapter } from "./platform.js";
import { archiveTask, createTask, unarchiveTask } from "./tasks.js";
import { selectArchived, selectTasks } from "./select.js";

const USER = "u1";

function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (n) => map.get(n) ?? null,
    setItem: (n, v) => void map.set(n, v),
    removeItem: (n) => void map.delete(n),
  };
}

function memoryPlatform(): PlatformAdapter {
  const map = new Map<string, string>();
  let n = 0;
  return {
    uuid: () => `id-${++n}`,
    isDev: false,
    kv: {
      get: (k) => map.get(k) ?? null,
      set: (k, v) => void map.set(k, v),
      remove: (k) => void map.delete(k),
    },
  };
}

beforeEach(async () => {
  configurePlatform(memoryPlatform());
  await configureStorage(memoryStorage());
  useKaiStore.setState({
    tasks: {}, projects: {}, busyBlocks: {}, lexicon: {},
    settings: null, fieldTimes: {}, outbox: emptyOutbox(),
    online: true, hydrated: true,
  });
});

function only() {
  const all = selectTasks(useKaiStore.getState().tasks);
  expect(all).toHaveLength(1);
  return all[0]!;
}

describe("createTask", () => {
  it("judul doang udah cukup, sisanya bawaan makeTask", () => {
    createTask({ title: "Bikin laporan" }, USER);
    const t = only();
    expect(t.title).toBe("Bikin laporan");
    expect(t.userId).toBe(USER);
    expect(t.status).toBe("todo");
    expect(t.priority).toBe(3);
    expect(t.allDay).toBe(false);
    expect(t.tags).toEqual([]);
    expect(t.subtasks).toEqual([]);
    expect(t.syncState).toBe("local");
  });

  it("balikin id yang sama kayak yang masuk store", () => {
    const id = createTask({ title: "x" }, USER);
    expect(only().id).toBe(id);
  });

  it("judulnya dirapiin", () => {
    createTask({ title: "   Beli susu  " }, USER);
    expect(only().title).toBe("Beli susu");
  });

  it("field form yang wajar tembus semua", () => {
    createTask(
      {
        title: "Revisi vlog",
        notes: "bagian intro",
        priority: 1,
        dueAt: "2026-09-10T02:00:00.000Z",
        allDay: true,
        estimateMin: 90,
        energy: "high",
        tags: ["vlog"],
        reminderMin: 30,
        reminders: { leads: [1440, 60] },
      },
      USER,
    );
    const t = only();
    expect(t.notes).toBe("bagian intro");
    expect(t.priority).toBe(1);
    expect(t.dueAt).toBe("2026-09-10T02:00:00.000Z");
    expect(t.allDay).toBe(true);
    expect(t.estimateMin).toBe(90);
    expect(t.energy).toBe("high");
    expect(t.tags).toEqual(["vlog"]);
    expect(t.reminderMin).toBe(30);
    expect(t.reminders).toEqual({ leads: [1440, 60] });
  });

  /**
   * Disaring pas JALAN, bukan cuma di tipe — form gampang nyebar objek, dan
   * satu `as` di jalan bikin penjagaan tipe gak ada artinya.
   */
  it("field cache & milik sinkronisasi GAK bisa disuntik", () => {
    createTask(
      {
        title: "x",
        // @ts-expect-error sengaja: niru pemanggil yang lolos lewat `as`
        actualMin: 999,
        rescheduleCount: 7,
        deletedAt: "2026-01-01T00:00:00.000Z",
        syncState: "synced",
      },
      USER,
    );
    const t = only();
    expect(t.actualMin).toBeUndefined();
    expect(t.rescheduleCount).toBe(0);
    expect(t.deletedAt).toBeUndefined();
    // Task baru itu selalu lokal — kalau bisa dibohongin jadi "synced",
    // outbox gak bakal pernah ngirim dia.
    expect(t.syncState).toBe("local");
  });

  it("id & userId gak bisa ditimpa dari input", () => {
    // @ts-expect-error sengaja: dua-duanya ditentuin di dalam
    createTask({ title: "x", id: "palsu", userId: "orang-lain" }, USER);
    const t = only();
    expect(t.id).not.toBe("palsu");
    expect(t.userId).toBe(USER);
  });
});

/**
 * Arsip. Yang diuji di sini bukan "statusnya berubah" — itu sepele — tapi
 * bahwa arsip punya JALAN BALIK. Sebelum ada layar arsip, `archiveTask` itu
 * satu arah: task-nya keluar dari `selectTasks`, dari papan, dari pencarian,
 * dan dari notifikasi sekaligus, tanpa satu pun tempat buat ngeliatnya lagi.
 */
describe("arsip", () => {
  it("yang diarsipin keluar dari daftar aktif, tapi kebaca di selectArchived", () => {
    createTask({ title: "Beresin gudang" }, USER);
    const t = only();
    archiveTask(t);

    const map = useKaiStore.getState().tasks;
    expect(selectTasks(map)).toHaveLength(0);
    expect(selectArchived(map).map((x) => x.title)).toEqual(["Beresin gudang"]);
  });

  it("bisa dibalikin, dan mendarat di todo", () => {
    createTask({ title: "Beresin gudang" }, USER);
    archiveTask(only());

    const arsip = selectArchived(useKaiStore.getState().tasks)[0]!;
    unarchiveTask(arsip);

    const map = useKaiStore.getState().tasks;
    expect(selectArchived(map)).toHaveLength(0);
    expect(selectTasks(map)[0]!.status).toBe("todo");
  });

  it("yang kehapus beneran TIDAK nongol di arsip", () => {
    // Diarsipin sama dihapus itu dua maksud yang beda. Tombstone gak boleh
    // bocor ke layar arsip cuma gara-gara dua-duanya sama-sama "gak aktif".
    createTask({ title: "Beresin gudang" }, USER);
    const t = only();
    archiveTask(t);
    useKaiStore.getState().patchTask(t.id, { deletedAt: new Date().toISOString() });

    expect(selectArchived(useKaiStore.getState().tasks)).toHaveLength(0);
  });
});
