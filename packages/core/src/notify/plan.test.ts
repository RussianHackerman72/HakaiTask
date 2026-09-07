/**
 * Kebijakan notifikasi — §6.7.
 *
 * Aturan di sini dilanggar sekali, user matiin notifikasi selamanya. Jadi tiap
 * aturannya dapat tes sendiri, dan yang paling penting bukan "notifnya muncul"
 * tapi "notifnya TIDAK muncul waktu gak seharusnya".
 */
import { describe, expect, it } from "vitest";
import { inQuietHours, planNotifications, resolveLeads } from "./plan.js";
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

/**
 * Kunci pengingat sekarang `due:<id>:<lead>` — satu task bisa punya banyak.
 * Dicek lewat awalan, biar tes "gak dapat notif" gak lulus cuma gara-gara
 * nebak angka lead-nya salah.
 */
function dueKeys(id: string, tasks: Task[], over: Partial<UserSettings> = {}, now = NOW) {
  return keys(tasks, over, now).filter((k) => k.startsWith(`due:${id}:`));
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

  /**
   * Dulu notifnya dibuang di kasus ini. Tenggat jam 02:00 artinya orangnya
   * gak diingetin SAMA SEKALI — padahal sore sebelumnya dia masih melek.
   */
  it("kalau digesernya bakal LEWAT tenggat, ditarik mundur ke sebelum jam tenang", () => {
    // Tenggat 8 Sep 02:00 → pengingat 01:00, di jam tenang. Maju ke 06:00
    // udah lewat tenggat, jadi mundur ke 7 Sep 21:59.
    const t = task({ dueAt: new Date(2026, 8, 8, 2, 0).toISOString() });
    const due = plan([t]).find((n) => n.kind === "due");
    expect(due).toBeDefined();
    const at = new Date(due!.at);
    expect(at.getDate()).toBe(7);
    expect(at.getHours()).toBe(21);
    expect(at.getMinutes()).toBe(59);
    // Yang penting: gak pernah bunyi DI DALAM jam tenang.
    expect(inQuietHours(at, ["22:00", "06:00"])).toBe(false);
  });

  it("kalau mundurnya juga udah lewat, baru dibatalin", () => {
    // Dilihat jam 23:30 — jam tenang udah mulai, tenggatnya jam 02:00.
    // Maju kelewat tenggat, mundur ke 21:59 udah lewat. Gak ada slot jujur.
    const malam = new Date(2026, 8, 7, 23, 30, 0);
    const t = task({ dueAt: new Date(2026, 8, 8, 2, 0).toISOString() });
    expect(dueKeys("t1", [t], {}, malam)).toHaveLength(0);
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
    expect(dueKeys("a", [task({ id: "a", dueAt: due, status: "done" })])).toHaveLength(0);
    expect(dueKeys("b", [task({ id: "b", dueAt: due, status: "archived" })])).toHaveLength(0);
    expect(
      dueKeys("c", [task({ id: "c", dueAt: due, deletedAt: NOW.toISOString() })]),
    ).toHaveLength(0);
  });

  it("yang udah lewat gak dijadwalin ulang", () => {
    const t = task({ dueAt: new Date(NOW.getTime() - HOUR).toISOString() });
    expect(dueKeys("t1", [t])).toHaveLength(0);
  });

  /**
   * Bug yang bikin "kok pengingatnya gak muncul". Task dari chat hampir selalu
   * tenggatnya deket, dan lead bawaannya 60 menit — jadi jendela pengingatnya
   * udah lewat sebelum task-nya sempat dibikin. Dulu langsung dibuang.
   */
  it("tenggat MASIH di depan tapi jendela lead-nya udah lewat → tetap dijadwalin", () => {
    // Tenggat 30 menit lagi, lead bawaan 60 menit → T−60 ada di masa lalu.
    const t = task({ dueAt: new Date(NOW.getTime() + 30 * 60_000).toISOString() });
    const due = plan([t]).find((n) => n.kind === "due");
    expect(due).toBeDefined();

    const at = new Date(due!.at).getTime();
    // Dimajuin ke sekarang — tapi jangan bunyi di detik yang sama.
    expect(at).toBeGreaterThan(NOW.getTime());
    expect(at).toBeLessThan(NOW.getTime() + 5 * 60_000);
  });

  it("lead-nya lewat DAN tenggatnya lewat → tetap gak dijadwalin", () => {
    // Batas fix di atas: yang dimajuin cuma yang tenggatnya masih di depan.
    const t = task({ dueAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() });
    expect(dueKeys("t1", [t])).toHaveLength(0);
  });

  it("di luar cakrawala 7 hari gak dijadwalin", () => {
    const t = task({ dueAt: new Date(NOW.getTime() + 30 * 24 * HOUR).toISOString() });
    expect(dueKeys("t1", [t])).toHaveLength(0);
  });

  it("tanpa tenggat gak dapat pengingat", () => {
    // Review mingguan TETAP dijadwalin — dia gak gantung sama task sama sekali.
    expect(keys([task({})]).filter((k) => k.startsWith("due:"))).toHaveLength(0);
  });
});

describe("jadwal pengingat per task", () => {
  const DAY_MIN = 1440;

  it("resolveLeads: urut dari yang paling DEKAT tenggat", () => {
    const t = task({ reminders: { leads: [60, 10080, 1440] } });
    expect(resolveLeads(t, settings)).toEqual([60, 1440, 10080]);
  });

  it("resolveLeads: tanpa apa-apa jatuh ke bawaan setelan", () => {
    expect(resolveLeads(task({}), settings)).toEqual([60]);
    expect(resolveLeads(task({ reminderMin: 15 }), settings)).toEqual([15]);
  });

  it("resolveLeads: `reminders` nimpa `reminderMin`", () => {
    const t = task({ reminderMin: 15, reminders: { leads: [120] } });
    expect(resolveLeads(t, settings)).toEqual([120]);
  });

  it("resolveLeads: repeat jadi deret, berhenti di tenggat", () => {
    // Mulai 3 hari sebelum, tiap 1 hari → 3 pengingat.
    const t = task({ reminders: { repeat: { startMin: 3 * DAY_MIN, everyMin: DAY_MIN } } });
    expect(resolveLeads(t, settings)).toEqual([1440, 2880, 4320]);
  });

  it("resolveLeads: leads + repeat digabung tanpa kembar", () => {
    const t = task({
      reminders: { leads: [1440, 60], repeat: { startMin: 2 * DAY_MIN, everyMin: DAY_MIN } },
    });
    expect(resolveLeads(t, settings)).toEqual([60, 1440, 2880]);
  });

  /**
   * Tanpa batas ini, "tiap 5 menit selama 30 hari" = 8.640 alarm — dan yang
   * jebol bukan cuma task itu, tapi plafon alarm SELURUH app.
   */
  it("resolveLeads: dibatasi per task, yang kepotong yang paling jauh", () => {
    const t = task({ reminders: { repeat: { startMin: 30 * DAY_MIN, everyMin: 5 } } });
    const leads = resolveLeads(t, settings);
    expect(leads).toHaveLength(64);
    expect(leads[0]).toBe(5); // yang paling deket tenggat selamat
    expect(Math.max(...leads)).toBe(64 * 5);
  });

  it("resolveLeads: everyMin 0 gak bikin loop gak berhenti", () => {
    const t = task({ reminders: { repeat: { startMin: 1440, everyMin: 0 } } });
    expect(resolveLeads(t, settings)).toEqual([60]); // jatuh ke bawaan
  });

  it("satu task bisa punya banyak notif, kuncinya beda-beda", () => {
    const t = task({
      dueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString(),
      reminders: { leads: [60, 120] },
    });
    expect(dueKeys("t1", [t]).sort()).toEqual(["due:t1:120", "due:t1:60"]);
  });

  /**
   * Inti fitur "ingetin seminggu sebelum": cakrawala 7 hari bikin pengingatnya
   * gak pernah kepasang buat tenggat yang masih jauh.
   */
  it("setelan tangan nembus cakrawala 7 hari", () => {
    const dueAt = new Date(NOW.getTime() + 21 * 24 * HOUR).toISOString();

    // Bawaan: masih kena batas 7 hari.
    expect(dueKeys("t1", [task({ dueAt })])).toHaveLength(0);

    // Disetel tangan "seminggu sebelum" → hari ke-14, di luar 7 tapi dalam 30.
    const manual = task({ dueAt, reminders: { leads: [7 * DAY_MIN] } });
    expect(dueKeys("t1", [manual])).toEqual(["due:t1:10080"]);
  });

  it("di luar 30 hari tetap gak dijadwalin", () => {
    const t = task({
      dueAt: new Date(NOW.getTime() + 60 * 24 * HOUR).toISOString(),
      reminders: { leads: [60] },
    });
    expect(dueKeys("t1", [t])).toHaveLength(0);
  });

  /**
   * Kalau delapan tick semalam digeser semua ke ujung jam tenang, jam 06:00
   * bunyi delapan kali. Buat deret, yang jatuh di jam tenang DIBUANG.
   */
  it("deret: tick di jam tenang dibuang, bukan digeser numpuk", () => {
    // Tenggat besok 12:00. Tiap 1 jam selama 12 jam → beberapa jatuh 00:00–06:00.
    const t = task({
      dueAt: new Date(2026, 8, 8, 12, 0).toISOString(),
      reminders: { repeat: { startMin: 12 * 60, everyMin: 60 } },
    });
    const ats = plan([t])
      .filter((n) => n.kind === "due")
      .map((n) => new Date(n.at));

    expect(ats.length).toBeGreaterThan(0);
    for (const at of ats) {
      expect(inQuietHours(at, ["22:00", "06:00"])).toBe(false);
    }
    // Gak ada dua notif di detik yang sama.
    expect(new Set(ats.map((d) => d.getTime())).size).toBe(ats.length);
  });

  /**
   * Batas harian itu buat notif yang GAK diminta. Kalau setelan tangan ikut
   * dipotong, user nyetel "tiap 2 jam" dan diem-diem cuma dapat 4.
   */
  it("setelan tangan kebal batas harian, otomatis tetap kena", () => {
    const dueAt = new Date(2026, 8, 8, 20, 0).toISOString();
    const t = task({
      dueAt,
      // Tiap 1 jam selama 10 jam — jauh di atas maxNotifPerDay = 2.
      reminders: { repeat: { startMin: 10 * 60, everyMin: 60 } },
    });

    const got = plan([t], { maxNotifPerDay: 2 });
    expect(got.filter((n) => n.kind === "due").length).toBeGreaterThan(2);
    // Ringkasan cuma dibikin kalau ADA yang kepotong — dan yang kebal gak.
    expect(got.filter((n) => n.kind === "due").every((n) => n.exempt)).toBe(true);
  });

  it("bawaan TETAP kena batas harian", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      task({
        id: `t${i}`,
        dueAt: new Date(2026, 8, 7, 15, 10 * i).toISOString(),
      }),
    );
    const got = plan(many, { maxNotifPerDay: 3 });
    expect(got.some((n) => n.kind === "summary")).toBe(true);
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
