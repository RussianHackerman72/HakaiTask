/** Mesin prioritas — PLAN.md §4 */
import { describe, expect, it } from "vitest";
import {
  buildGreeting,
  energyMatch,
  greetingSlot,
  inferEnergyMode,
  rankTasks,
  scoreTask,
  selectFocus,
  urgency,
} from "./scoring.js";
import { makeTask } from "./types.js";
import type { Task } from "./types.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0);

function task(over: Partial<Task> & { id: string }): Task {
  return makeTask({
    userId: "u1",
    title: over.id,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  });
}

const ctx = { now: NOW, energyMode: "medium" as const };

describe("urgency", () => {
  it("lewat deadline = maksimum", () => {
    expect(urgency(new Date(2026, 7, 6).toISOString(), NOW)).toBe(1.0);
  });

  it("tanpa deadline lebih rendah dari minggu depan", () => {
    const nextWeek = new Date(2026, 7, 20).toISOString();
    expect(urgency(undefined, NOW)).toBeGreaterThan(urgency(nextWeek, NOW));
  });

  it("naik mendekati deadline", () => {
    const in1h = new Date(NOW.getTime() + 3_600_000).toISOString();
    const in3d = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
    expect(urgency(in1h, NOW)).toBeGreaterThan(urgency(in3d, NOW));
  });
});

describe("energyMatch", () => {
  it("cocok = 1, selisih satu = 0.4, berlawanan = 0", () => {
    expect(energyMatch("low", "low")).toBe(1);
    expect(energyMatch("medium", "low")).toBe(0.4);
    expect(energyMatch("high", "low")).toBe(0);
  });

  it("mode auto turun setelah banyak sesi fokus", () => {
    const pagi = new Date(2026, 7, 7, 8, 0);
    expect(inferEnergyMode(pagi, 0)).toBe("high");
    expect(inferEnergyMode(pagi, 5)).toBe("medium");
  });
});

describe("energi menggeser urutan, bukan menyembunyikan", () => {
  it("P1 lewat deadline tetap menang walau energi gak cocok", () => {
    const overdueP1 = task({
      id: "overdue",
      priority: 1,
      energy: "high",
      dueAt: new Date(2026, 7, 6).toISOString(),
    });
    const easyMatch = task({ id: "easy", priority: 4, energy: "low", estimateMin: 10 });

    const ranked = rankTasks([overdueP1, easyMatch], { now: NOW, energyMode: "low" });
    expect(ranked[0]!.task.id).toBe("overdue");
  });
});

describe("bonus & penalti", () => {
  it("quick win menaikkan skor task pendek", () => {
    const short = task({ id: "short", estimateMin: 10 });
    const long = task({ id: "long", estimateMin: 120 });
    expect(scoreTask(short, ctx).total).toBeGreaterThan(scoreTask(long, ctx).total);
  });

  it("status doing dapat dorongan", () => {
    const doing = task({ id: "a", status: "doing" });
    const todo = task({ id: "b", status: "todo" });
    expect(scoreTask(doing, ctx).total).toBeGreaterThan(scoreTask(todo, ctx).total);
  });

  it("task yang diblokir turun", () => {
    const blocked = task({ id: "a", blockedBy: ["x"] });
    const free = task({ id: "b" });
    expect(scoreTask(blocked, { ...ctx, doneIds: new Set() }).total).toBeLessThan(
      scoreTask(free, ctx).total,
    );
  });

  it("task yang di-snooze terlempar ke bawah", () => {
    const snoozed = task({
      id: "a",
      priority: 1,
      snoozedUntil: new Date(NOW.getTime() + 86_400_000).toISOString(),
    });
    expect(scoreTask(snoozed, ctx).snoozed).toBe(true);
    expect(scoreTask(snoozed, ctx).total).toBeLessThan(0);
  });

  it("task yang mengendap naik pelan-pelan", () => {
    const old = task({
      id: "old",
      createdAt: new Date(2026, 6, 1).toISOString(),
    });
    const fresh = task({ id: "fresh" });
    expect(scoreTask(old, ctx).aging).toBeGreaterThan(scoreTask(fresh, ctx).aging);
  });
});

describe("selectFocus", () => {
  it("kosong sama sekali", () => {
    expect(selectFocus([], ctx).kind).toBe("empty");
  });

  it("ada tugas hari ini", () => {
    const today = task({ id: "t", dueAt: new Date(2026, 7, 7, 14, 0).toISOString() });
    const sel = selectFocus([today], ctx);
    expect(sel.kind).toBe("today");
    expect(sel.focus?.id).toBe("t");
  });

  it("hari ini kosong → mundur ke tugas mendatang", () => {
    const future = task({ id: "f", dueAt: new Date(2026, 7, 9, 16, 0).toISOString() });
    const sel = selectFocus([future], ctx);
    expect(sel.kind).toBe("upcoming");
    expect(sel.focus?.id).toBe("f");
  });

  it("task selesai tidak ikut", () => {
    const done = task({ id: "d", status: "done" });
    expect(selectFocus([done], ctx).kind).toBe("empty");
  });
});

describe("sapaan", () => {
  it("slot mengikuti jam", () => {
    expect(greetingSlot(new Date(2026, 7, 7, 7))).toBe("pagi");
    expect(greetingSlot(new Date(2026, 7, 7, 12))).toBe("siang");
    expect(greetingSlot(new Date(2026, 7, 7, 16))).toBe("sore");
    expect(greetingSlot(new Date(2026, 7, 7, 21))).toBe("malam");
  });

  it("baris kedua mengikuti hasil seleksi", () => {
    const today = task({ id: "t", dueAt: new Date(2026, 7, 7, 14).toISOString() });
    expect(buildGreeting("Kai", selectFocus([today], ctx), NOW).baris2).toBe(
      "Tugas kamu hari ini adalah",
    );
    expect(buildGreeting("Kai", selectFocus([], ctx), NOW).baris2).toBe(
      "Hari ini kamu bebas.",
    );
  });
});
