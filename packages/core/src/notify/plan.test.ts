/**
 * Kebijakan notifikasi — §6.7.
 *
 * Aturan di sini dilanggar sekali, user matiin notifikasi selamanya. Jadi tiap
 * aturannya dapat tes sendiri, dan yang paling penting bukan "notifnya muncul"
 * tapi "notifnya TIDAK muncul waktu gak seharusnya".
 */
import { describe, expect, it } from "vitest";
import { inQuietHours, planNotifications } from "./plan.js";
import { DEFAULT_SETTINGS, makeTask, type Task, type UserSettings } from "../types.js";

const NOW = new Date(2026, 8, 7, 10, 0, 0); // Senin 7 Sep 2026, 10:00
const HOUR = 3_600_000;

const settings: UserSettings = { ...DEFAULT_SETTINGS, userId: "u1" };

function task(over: Partial<Task> = {}): Task {
  return makeTask({ id: "t1", userId: "u1", title: "Revisi vlog", ...over });
}

function plan(tasks: Task[], over: Partial<UserSettings> = {}, now = NOW) {
  return planNotifications({ tasks, now, settings: { ...settings, ...over } });
}

function keys(tasks: Task[], over: Partial<UserSettings> = {}, now = NOW): string[] {
  return plan(tasks, over, now).map((n) => n.key);
}

describe("jam tenang", () => {
  /**
   * Rentangnya NGELEWATIN tengah malam, jadi perbandingannya OR bukan AND.
   * Ditulis kebalik, jam 23:00 lolos dan jam 12 siang malah diblokir — dan
   * dua-duanya kelihatan "jalan" kalau cuma dites satu arah.
   */
  it("22:00–06:00 kehitung, siang enggak", () => {
    const q = ["22:00", "06:00"] as const;
    expect(inQuietHours(new Date(2026, 8, 7, 23, 0), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 8, 7, 3, 0), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 8, 7, 22, 0), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 8, 7, 5, 59), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 8, 7, 6, 0), q)).toBe(false);
    expect(inQuietHours(new Date(2026, 8, 7, 12, 0), q)).toBe(false);
    expect(inQuietHours(new Date(2026, 8, 7, 21, 59), q)).toBe(false);
  });

  it("pengingat yang jatuh di jam tenang digeser ke pagi", () => {
    // Tenggat jam 09:00 besok, lead 60m → pengingat jam 08:00. Aman.
    const t = task({ dueAt: new Date(2026, 8, 8, 9, 0).toISOString() });
    const due = plan([t]).find((n) => n.kind === "due");
    expect(new Date(due!.at).getHours()).toBe(8);
  });

  it("kalau digesernya bakal LEWAT tenggat, notifnya dibatalin", () => {
    // Tenggat jam 02:00 dini hari — pengingatnya jam 01:00, di jam tenang.
    // Digeser ke 06:00 malah sesudah tenggat, jadi gak ada gunanya.
    const t = task({ dueAt: new Date(2026, 8, 8, 2, 0).toISOString() });
    expect(keys([t])).not.toContain("due:t1");
  });
});

describe("pengingat tenggat", () => {
  it("dijadwalin T−reminderMin", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() });
    const n = plan([t]).find((x) => x.kind === "due")!;
    expect(new Date(n.at).getTime()).toBe(NOW.getTime() + 4 * HOUR);
  });

  it("reminderMin per task nimpa default", () => {
    const t = task({
      dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString(),
      reminderMin: 30,
    });
    const n = plan([t]).find((x) => x.kind === "due")!;
    expect(new Date(n.at).getTime()).toBe(NOW.getTime() + 4.5 * HOUR);
  });

  /** Notif buat task yang udah kelar itu bikin orang matiin notifikasi. */
  it("task selesai / arsip / kehapus GAK dapat notif", () => {
    const due = new Date(NOW.getTime() + 5 * HOUR).toISOString();
    expect(keys([task({ id: "a", dueAt: due, status: "done" })])).not.toContain("due:a");
    expect(keys([task({ id: "b", dueAt: due, status: "archived" })])).not.toContain("due:b");
    expect(
      keys([task({ id: "c", dueAt: due, deletedAt: NOW.toISOString() })]),
    ).not.toContain("due:c");
  });

  it("yang udah lewat gak dijadwalin ulang", () => {
    const t = task({ dueAt: new Date(NOW.getTime() - HOUR).toISOString() });
    expect(keys([t])).not.toContain("due:t1");
  });

  it("di luar cakrawala 7 hari gak dijadwalin", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 30 * 24 * HOUR).toISOString() });
    expect(keys([t])).not.toContain("due:t1");
  });

  it("tanpa tenggat gak dapat pengingat", () => {
    // Review mingguan TETAP dijadwalin — dia gak gantung sama task sama sekali.
    expect(keys([task({})]).filter((k) => k.startsWith("due:"))).toHaveLength(0);
  });
});

describe("tiap notif nunjuk ke sesuatu (aturan 3)", () => {
  it("pengingat tenggat bawa taskId", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() });
    expect(plan([t]).find((n) => n.kind === "due")!.data.taskId).toBe("t1");
  });
});

describe("ringkasan tertunggak", () => {
  it("jam 20:00, sekali sehari, cuma kalau ada yang telat", () => {
    const late = task({ dueAt: new Date(NOW.getTime() - 5 * HOUR).toISOString() });
    const n = plan([late]).find((x) => x.kind === "overdue")!;
    expect(n).toBeDefined();
    expect(new Date(n.at).getHours()).toBe(20);
    expect(n.title).toContain("1 tugas");
  });

  it("gak ada yang telat = gak ada ringkasan", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() });
    expect(plan([t]).some((n) => n.kind === "overdue")).toBe(false);
  });
});

describe("morning brief", () => {
  it("cuma di hari yang ADA isinya", () => {
    const besok = new Date(2026, 8, 8, 14, 0);
    const t = task({ dueAt: besok.toISOString() });
    const briefs = plan([t]).filter((n) => n.kind === "brief");
    expect(briefs).toHaveLength(1);
    expect(new Date(briefs[0]!.at).getDate()).toBe(8);
    expect(new Date(briefs[0]!.at).getHours()).toBe(7);
  });

  /** Dibangunin cuma buat dikasih tau "gak ada apa-apa" itu bikin kesel. */
  it("hari kosong GAK dapat brief", () => {
    expect(plan([]).filter((n) => n.kind === "brief")).toHaveLength(0);
  });

  it("bisa dimatiin lewat setelan (aturan 4)", () => {
    const t = task({ dueAt: new Date(2026, 8, 8, 14, 0).toISOString() });
    const off = plan([t], { morningBriefAt: undefined as unknown as string });
    expect(off.some((n) => n.kind === "brief")).toBe(false);
  });
});

describe("batas per hari (aturan 1)", () => {
  it("kelebihan digabung jadi SATU ringkasan, bukan dibuang", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task({
        id: `t${i}`,
        title: `Task ${i}`,
        // Semuanya sore ini, jadi numpuk di satu hari.
        dueAt: new Date(2026, 8, 7, 15 + 0, 10 * i).toISOString(),
      }),
    );
    const out = plan(tasks, { maxNotifPerDay: 4 });
    const today = out.filter((n) => new Date(n.at).getDate() === 7);

    expect(today).toHaveLength(4);
    expect(today.filter((n) => n.kind === "summary")).toHaveLength(1);
    // Yang kelebihan tetap kesebut, gak ilang diam-diam.
    expect(today.find((n) => n.kind === "summary")!.title).toMatch(/lagi$/);
  });

  it("di bawah batas gak diapa-apain", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() });
    expect(plan([t], { maxNotifPerDay: 4 }).some((n) => n.kind === "summary")).toBe(false);
  });

  it("batas 0 = gak ada notif sama sekali", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() });
    expect(plan([t], { maxNotifPerDay: 0 })).toHaveLength(0);
  });
});

describe("idempoten", () => {
  /**
   * Rekonsiliasi di lapisan app bandingin lewat `key`. Kalau key-nya goyang
   * tiap panggilan, tiap app dibuka bakal batalin-dan-jadwalin-ulang semuanya.
   */
  it("key-nya sama persis dipanggil berkali-kali", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString() });
    expect(keys([t])).toEqual(keys([t]));
    expect(keys([t])).toEqual(keys([t]));
  });

  it("urutannya selalu menaik menurut waktu", () => {
    const tasks = [
      task({ id: "a", dueAt: new Date(NOW.getTime() + 9 * HOUR).toISOString() }),
      task({ id: "b", dueAt: new Date(NOW.getTime() + 3 * HOUR).toISOString() }),
    ];
    const out = plan(tasks).map((n) => n.at);
    expect([...out].sort()).toEqual(out);
  });
});
