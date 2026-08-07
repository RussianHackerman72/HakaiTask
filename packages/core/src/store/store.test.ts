/**
 * Test store — fokus ke yang gampang pecah diam-diam: hydration dan
 * resolusi konflik LWW per field (§6.8).
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { configureStorage, useKaiStore } from "./index.js";
import { makeTask, type Task } from "../types.js";
import { emptyOutbox } from "../sync/index.js";

function memoryStorage(seed: Record<string, string> = {}): StateStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => void map.set(name, value),
    removeItem: (name) => void map.delete(name),
  };
}

function task(partial: Partial<Task> = {}): Task {
  return makeTask({ id: "t1", userId: "u1", title: "Revisi vlog", ...partial });
}

function reset(): void {
  useKaiStore.setState({
    tasks: {},
    projects: {},
    busyBlocks: {},
    settings: null,
    fieldTimes: {},
    outbox: emptyOutbox(),
    online: true,
    hydrated: false,
  });
}

/** Adapter harus kepasang duluan: tiap setState ikut nulis ke storage. */
async function fresh(seed?: Record<string, string>): Promise<void> {
  await configureStorage(memoryStorage(seed));
  reset();
}

describe("hydration", () => {
  it("nandain hydrated lewat action, bukan mutasi diam-diam", async () => {
    await fresh();
    expect(useKaiStore.getState().hydrated).toBe(false);

    await configureStorage(memoryStorage());
    expect(useKaiStore.getState().hydrated).toBe(true);
  });

  it("tetap hydrated walau isi storage rusak — app gak boleh nyangkut", async () => {
    await fresh();
    await configureStorage(memoryStorage({ hakaitask: "{bukan json" }));
    // jalur pemulihan lewat queueMicrotask
    await new Promise((r) => setTimeout(r, 0));

    expect(useKaiStore.getState().hydrated).toBe(true);
  });
});

describe("mutasi lokal", () => {
  beforeEach(() => fresh());

  it("patchTask nulis lokal dan ngantre di outbox", () => {
    const t = task();
    useKaiStore.getState().upsertTask(t);
    useKaiStore.getState().patchTask(t.id, { priority: 1 });

    expect(useKaiStore.getState().tasks[t.id]!.priority).toBe(1);
    expect(useKaiStore.getState().outbox.queue).toHaveLength(2);
  });

  it("hapus itu tombstone, bukan buang dari map", () => {
    const t = task();
    useKaiStore.getState().upsertTask(t);
    useKaiStore.getState().removeTask(t.id);

    expect(useKaiStore.getState().tasks[t.id]?.deletedAt).toBeDefined();
  });
});

describe("mergeRemoteTask", () => {
  beforeEach(() => fresh());

  it("baris baru dari server langsung masuk", () => {
    const remote = task({ id: "t9", title: "Dari HP" });
    useKaiStore.getState().mergeRemoteTask(remote, "2026-08-07T10:00:00.000Z");

    expect(useKaiStore.getState().tasks.t9!.title).toBe("Dari HP");
  });

  it("field yang lebih baru di server menang", () => {
    const t = task();
    useKaiStore.getState().upsertTask(t);
    useKaiStore.getState().ackMutation(useKaiStore.getState().outbox.queue[0]!.id);

    const remote = { ...t, title: "Judul dari HP" };
    useKaiStore.getState().mergeRemoteTask(remote, "2099-01-01T00:00:00.000Z");

    expect(useKaiStore.getState().tasks[t.id]!.title).toBe("Judul dari HP");
  });

  it("field yang lebih lama di server diabaikan", () => {
    const t = task();
    useKaiStore.getState().upsertTask(t);
    useKaiStore.getState().ackMutation(useKaiStore.getState().outbox.queue[0]!.id);

    const remote = { ...t, title: "Judul basi" };
    useKaiStore.getState().mergeRemoteTask(remote, "1999-01-01T00:00:00.000Z");

    expect(useKaiStore.getState().tasks[t.id]!.title).toBe("Revisi vlog");
  });

  it("field yang masih nunggu kirim gak boleh ketimpa server", () => {
    const t = task();
    useKaiStore.getState().upsertTask(t);
    useKaiStore.getState().ackMutation(useKaiStore.getState().outbox.queue[0]!.id);

    // Edit lokal yang belum sempat terkirim.
    useKaiStore.getState().patchTask(t.id, { title: "Belum kekirim" });

    // Server ngirim versi lain dengan waktu jauh lebih baru.
    useKaiStore
      .getState()
      .mergeRemoteTask({ ...t, title: "Versi server" }, "2099-01-01T00:00:00.000Z");

    expect(useKaiStore.getState().tasks[t.id]!.title).toBe("Belum kekirim");
  });
});
