/**
 * Tulang punggung chat, diuji tanpa renderer sama sekali.
 *
 * `chatTurn()` murni dan `applyEffect` cuma nyentuh store, jadi satu giliran
 * chat utuh — ketikan masuk, efek keluar, store berubah — bisa dijalanin di
 * node. Ini yang bikin layar chat di web & mobile bisa dipercaya tanpa harus
 * dites dua kali di dua platform.
 *
 * Dua perilaku disini SENGAJA dipatok karena halus dan gampang ilang pas
 * refactor: SAVE_VOCAB ngidupin lagi entri yang udah dihapus (bukan bikin
 * kembar), dan RESTORE_TASK cuma ngosongin tombstone.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { configureStorage, useKaiStore } from "@hakaitask/core/store";
import { emptyOutbox } from "@hakaitask/core/sync";
import { chatTurn, type ChatContext } from "@hakaitask/core/chat";
import { makeTask, type Task, type UserLexiconEntry } from "@hakaitask/core";
import { configurePlatform, type PlatformAdapter } from "./platform.js";
import { applyEffect } from "./chat.js";
import { selectTasks, selectVocab } from "./select.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0); // Jumat 7 Agu 2026
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

async function fresh(): Promise<void> {
  configurePlatform(memoryPlatform());
  await configureStorage(memoryStorage());
  useKaiStore.setState({
    tasks: {}, projects: {}, busyBlocks: {}, lexicon: {},
    settings: null, fieldTimes: {}, outbox: emptyOutbox(),
    online: true, hydrated: true,
  });
}

function ctx(over: Partial<ChatContext> = {}): ChatContext {
  const s = useKaiStore.getState();
  return {
    now: NOW,
    tasks: selectTasks(s.tasks),
    blocks: [],
    vocab: selectVocab(s.lexicon),
    pending: null,
    userName: "Kai",
    ...over,
  };
}

/** Satu giliran utuh: ketikan → efek dijalanin → store berubah. */
function turn(input: string, over: Partial<ChatContext> = {}) {
  const t = chatTurn(input, ctx(over));
  for (const e of t.effects) applyEffect(e, USER);
  return t;
}

function tasks(): Task[] {
  return selectTasks(useKaiStore.getState().tasks);
}

function seedTask(partial: Partial<Task> = {}): Task {
  const t = makeTask({ id: "seed1", userId: USER, title: "Revisi vlog", ...partial });
  useKaiStore.getState().upsertTask(t);
  return t;
}

beforeEach(async () => {
  await fresh();
});

describe("bikin task lewat chat", () => {
  it("kalimat dengan aba-aba bikin task + masuk outbox", () => {
    turn("jadwalin rapat sama klien rabu jam 3");
    const all = tasks();
    expect(all).toHaveLength(1);
    expect(all[0]!.title.toLowerCase()).toContain("rapat");
    // Nulis lokal WAJIB ikut ngantre — kalau enggak, offline-first-nya bocor.
    expect(useKaiStore.getState().outbox.queue.length).toBeGreaterThan(0);
  });

  it("basa-basi TIDAK nyangkut jadi task", () => {
    turn("ok makasih");
    expect(tasks()).toHaveLength(0);
  });

  it("judul tanpa aba-aba nanya dulu, belum nulis apa-apa", () => {
    const t = turn("beli kopi");
    expect(tasks()).toHaveLength(0);
    expect(t.pending).not.toBeNull();
  });
});

describe("PATCH_TASK & DELETE_TASK", () => {
  it("selesaiin nandain done", () => {
    seedTask();
    turn("selesaiin revisi vlog");
    expect(useKaiStore.getState().tasks.seed1!.status).toBe("done");
  });

  it("hapus itu tombstone, bukan ngilang dari map", () => {
    seedTask();
    const t = turn("hapus revisi vlog");
    // Hapus wajib konfirmasi dulu (§ jangan pernah nebak kalau merusak).
    expect(t.pending).not.toBeNull();
    turn("ya", { pending: t.pending });

    const raw = useKaiStore.getState().tasks.seed1!;
    expect(raw).toBeDefined();
    expect(raw.deletedAt).toBeDefined();
    expect(tasks()).toHaveLength(0);
  });
});

describe("RESTORE_TASK", () => {
  it("`batal` sesudah hapus ngosongin tombstone-nya lagi", () => {
    seedTask();
    const del = turn("hapus revisi vlog");
    const after = turn("ya", { pending: del.pending });
    expect(useKaiStore.getState().tasks.seed1!.deletedAt).toBeDefined();

    turn("batal", { pending: after.pending });
    expect(useKaiStore.getState().tasks.seed1!.deletedAt).toBeUndefined();
    expect(tasks()).toHaveLength(1);
  });
});

describe("SAVE_VOCAB / DELETE_VOCAB", () => {
  /**
   * Ngajarin itu MINTA KONFIRMASI dulu — `SAVE_VOCAB` baru keluar sesudah
   * "ya". Konsisten sama disiplin yang sama di tempat lain: apa pun yang
   * ngubah data gak boleh kejadian cuma gara-gara kalimatnya kelihatan mirip.
   */
  function ajarin(kalimat: string): void {
    const t = turn(kalimat);
    expect(t.pending).toMatchObject({ kind: "teach", step: "confirm" });
    // Belum ada yang kesimpen sebelum diiyain.
    turn("ya", { pending: t.pending });
  }

  it("ngajarin frasa nyimpen satu entri (sesudah dikonfirmasi)", () => {
    ajarin("kalau gw bilang clientan, maksudnya meeting client");
    const v = selectVocab(useKaiStore.getState().lexicon);
    expect(v).toHaveLength(1);
    expect(v[0]!.phrase).toBe("clientan");
    expect(v[0]!.meaning).toBe("meeting client");
  });

  it("belum diiyain = belum kesimpen", () => {
    const t = turn("kalau gw bilang clientan, maksudnya meeting client");
    expect(t.effects).toHaveLength(0);
    expect(selectVocab(useKaiStore.getState().lexicon)).toHaveLength(0);
  });

  it("ngajarin ulang frasa yang sama MEMPERBARUI, bukan bikin kembar", () => {
    ajarin("kalau gw bilang clientan, maksudnya meeting client");
    const first = selectVocab(useKaiStore.getState().lexicon)[0]!;

    ajarin("kalau gw bilang clientan, maksudnya ketemu klien");
    const after = selectVocab(useKaiStore.getState().lexicon);

    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(first.id);
    expect(after[0]!.meaning).toBe("ketemu klien");
  });

  it("frasa yang pernah dihapus DIHIDUPKAN lagi, bukan bikin baris baru", () => {
    ajarin("kalau gw bilang clientan, maksudnya meeting client");
    const entry = selectVocab(useKaiStore.getState().lexicon)[0]!;

    useKaiStore.getState().removeLexicon(entry.id);
    expect(selectVocab(useKaiStore.getState().lexicon)).toHaveLength(0);

    ajarin("kalau gw bilang clientan, maksudnya meeting client");
    const revived = selectVocab(useKaiStore.getState().lexicon);
    expect(revived).toHaveLength(1);
    expect(revived[0]!.id).toBe(entry.id);

    const raw = useKaiStore.getState().lexicon[entry.id] as UserLexiconEntry;
    expect(raw.deletedAt).toBeUndefined();
  });
});

describe("jalur tulis tunggal", () => {
  it("tiap efek yang ngubah data ninggalin jejak di outbox", () => {
    seedTask();
    useKaiStore.setState({ outbox: emptyOutbox() });

    turn("selesaiin revisi vlog");

    const q = useKaiStore.getState().outbox.queue;
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((m) => m.entity === "task")).toBe(true);
  });
});
