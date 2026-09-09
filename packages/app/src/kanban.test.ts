/**
 * Papan kanban — kolom & aritmatika urutan.
 *
 * Murni, jadi diuji tanpa store dan tanpa renderer. Yang paling penting di
 * sini bukan "kartunya masuk kolom yang bener", tapi dua sifat yang gampang
 * ilang pas refactor:
 *
 *   1. Mindahin SATU kartu cuma nulis SATU baris. Kalau sampai nomorin ulang
 *      tiap geser, sinkronisasi LWW bikin dua HP saling nimpa dan urutannya
 *      jadi acak di dua-duanya.
 *   2. Celah pecahan yang abis KETAHUAN, bukan diem-diem bikin kartunya
 *      "pindah" ke tempat yang sama.
 */
import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@hakaitask/core";
import { board, columnTasks, planMove, rankBetween, renumber } from "./kanban.js";

function task(over: Partial<Task> & { id: string }): Task {
  return makeTask({ userId: "u1", title: over.id, ...over });
}

describe("kolom", () => {
  it("dipisah per status, arsip & tombstone gak ikut", () => {
    const b = board([
      task({ id: "a", status: "todo" }),
      task({ id: "b", status: "doing" }),
      task({ id: "c", status: "done" }),
      task({ id: "d", status: "archived" }),
      task({ id: "e", status: "todo", deletedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(b.todo.map((t) => t.id)).toEqual(["a"]);
    expect(b.doing.map((t) => t.id)).toEqual(["b"]);
    expect(b.done.map((t) => t.id)).toEqual(["c"]);
  });

  it("yang udah diurutin tangan naik di atas yang belum", () => {
    const got = columnTasks(
      [
        task({ id: "bawaan", status: "todo", priority: 1 }),
        task({ id: "tangan", status: "todo", priority: 4, order: 500 }),
      ],
      "todo",
    );
    // Prioritas 1 kalah sama urutan tangan — begitu user ngatur sendiri,
    // hasilnya harus kelihatan di puncak.
    expect(got.map((t) => t.id)).toEqual(["tangan", "bawaan"]);
  });

  it("tanpa order: prioritas, lalu tenggat, lalu judul", () => {
    const got = columnTasks(
      [
        task({ id: "c", title: "c", status: "todo", priority: 2 }),
        task({ id: "a", title: "a", status: "todo", priority: 2 }),
        task({ id: "p1", title: "p1", status: "todo", priority: 1 }),
        task({
          id: "deket",
          title: "deket",
          status: "todo",
          priority: 2,
          dueAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      "todo",
    );
    expect(got.map((t) => t.id)).toEqual(["p1", "deket", "a", "c"]);
  });
});

describe("rankBetween", () => {
  it("kolom kosong, ujung atas, ujung bawah", () => {
    expect(rankBetween(undefined, undefined)).toEqual({ ok: true, order: 0 });
    expect(rankBetween(undefined, 100)).toEqual({ ok: true, order: 100 - 1024 });
    expect(rankBetween(100, undefined)).toEqual({ ok: true, order: 100 + 1024 });
  });

  it("di antara dua kartu = tengah-tengahnya", () => {
    expect(rankBetween(0, 1024)).toEqual({ ok: true, order: 512 });
  });

  /**
   * Ini yang bikin bug-nya kelihatan, bukan diem. Tanpa penjagaan ini,
   * tengah-tengah dua angka yang udah mepet dibulatin balik ke tetangganya
   * dan kartunya "pindah" ke tempat yang sama persis.
   */
  it("celah kehabisan ketelitian → minta nomor ulang, bukan diem", () => {
    expect(rankBetween(1, 1 + 1e-9)).toEqual({ ok: false, reason: "renumber" });
  });
});

describe("planMove", () => {
  const kolom = [
    task({ id: "a", status: "todo", order: 0 }),
    task({ id: "b", status: "todo", order: 1024 }),
    task({ id: "c", status: "todo", order: 2048 }),
  ];

  it("nyelip di tengah = satu angka di antara tetangganya", () => {
    const p = planMove(kolom, "c", "todo", 1);
    expect(p).toEqual({ status: "todo", order: 512 });
  });

  it("kartu yang digeser gak keitung jadi tetangganya sendiri", () => {
    // Geser "a" ke posisi 1: sisanya [b, c], jadi mendarat antara b dan c.
    const p = planMove(kolom, "a", "todo", 1);
    expect(p!.order).toBeGreaterThan(1024);
    expect(p!.order).toBeLessThan(2048);
  });

  it("pindah kolom bawa status baru", () => {
    const p = planMove(kolom, "a", "doing", 0);
    expect(p!.status).toBe("doing");
  });

  it("index di luar batas dijepit, bukan bikin lubang", () => {
    expect(planMove(kolom, "a", "todo", 99)!.order).toBe(2048 + 1024);
    expect(planMove(kolom, "c", "todo", -5)!.order).toBe(0 - 1024);
  });

  /** Sifat yang paling penting: satu geseran = satu baris berubah. */
  it("geseran biasa GAK nomorin ulang kolomnya", () => {
    expect(planMove(kolom, "c", "todo", 1)!.renumber).toBeUndefined();
  });

  it("kalau celahnya abis, rencananya bawa nomor ulang sekalian", () => {
    const mepet = [
      task({ id: "a", status: "todo", order: 1 }),
      task({ id: "b", status: "todo", order: 1 + 1e-9 }),
      task({ id: "x", status: "todo", order: 9999 }),
    ];
    const p = planMove(mepet, "x", "todo", 1);
    expect(p!.renumber).toBeDefined();
    expect(p!.renumber!.map((r) => r.id)).toEqual(["a", "b"]);
    // Sesudah dinomorin ulang, ada ruang lagi di antaranya.
    expect(p!.order).toBeGreaterThan(0);
    expect(p!.order).toBeLessThan(1024);
  });
});

describe("renumber", () => {
  it("nyebar rata dengan jarak yang lega", () => {
    expect(
      renumber([task({ id: "a" }), task({ id: "b" }), task({ id: "c" })]),
    ).toEqual([
      { id: "a", order: 0 },
      { id: "b", order: 1024 },
      { id: "c", order: 2048 },
    ]);
  });
});
