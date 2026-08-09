/**
 * Menjaga janji README.
 *
 * Tiap contoh yang ditulis di README dites di sini. README yang menjanjikan
 * hal yang gak jalan lebih buruk daripada gak ada README sama sekali — dan
 * contoh gampang basi diam-diam pas kamus berubah.
 */
import { describe, expect, it } from "vitest";
import { makeTask, type BusyBlock, type Task } from "../types.js";
import { chatTurn, type ChatContext, type Effect, type Pending } from "./machine.js";
import { parseQuickAdd } from "../parser/index.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0); // Jumat 7 Agu 2026

function iso(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

function ctx(over: Partial<ChatContext> = {}): ChatContext {
  return { now: NOW, tasks: [], blocks: [], vocab: [], pending: null, userName: "Kai", ...over };
}

function conv(base: Partial<ChatContext> = {}) {
  let pending: Pending = null;
  return {
    send(input: string) {
      const r = chatTurn(input, { ...ctx(base), pending });
      pending = r.pending;
      return r;
    },
  };
}

function textOf(r: { messages: { text: string }[] }): string {
  return r.messages.map((m) => m.text).join("\n");
}

function created(input: string): Extract<Effect, { type: "CREATE_FROM_PARSE" }> {
  const r = conv().send(input);
  const e = r.effects[0];
  expect(e?.type, `"${input}" mestinya bikin sesuatu`).toBe("CREATE_FROM_PARSE");
  return e as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
}

// ── contoh di bagian "Sekilas" ───────────────────────────────────────────────

describe("README — percakapan pembuka", () => {
  const blocks: BusyBlock[] = [
    { id: "b1", userId: "u1", title: "Standup", startAt: iso(2026, 8, 12, 9, 0), endAt: iso(2026, 8, 12, 9, 15) },
  ];

  it("jadwalin rapat sama klien rabu jam 3", () => {
    const e = created("jadwalin rapat sama klien rabu jam 3");
    expect(e.parsed.title).toBe("Rapat sama klien");
    expect(e.parsed.dueAt?.getDate()).toBe(12);
    expect(e.parsed.dueAt?.getHours()).toBe(15);
    expect(e.parsed.kind).toBe("task");
  });

  it("apa aja agenda gw rabu?", () => {
    const tasks = [makeTask({ id: "t1", userId: "u1", title: "Rapat sama klien", dueAt: iso(2026, 8, 12, 15, 0) })];
    const out = textOf(conv({ tasks, blocks }).send("apa aja agenda gw rabu?"));
    expect(out).toContain("Standup");
    expect(out).toContain("Rapat sama klien");
  });

  it("rabu jam 4 gw kosong ga?", () => {
    expect(textOf(conv({ blocks }).send("rabu jam 4 gw kosong ga?"))).toContain("kosong");
  });

  it("ok makasih — gak ninggalin jejak", () => {
    const r = conv().send("ok makasih");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toBe("Sama-sama.");
  });
});

// ── contekan: nambah ─────────────────────────────────────────────────────────

describe("README — contekan nambah", () => {
  it("tambahin bikin laporan besok jam 9", () => {
    const e = created("tambahin bikin laporan besok jam 9");
    expect(e.parsed.title).toBe("Bikin laporan");
    expect(e.parsed.dueAt?.getHours()).toBe(9);
  });

  it("ingetin bayar listrik tanggal 25", () => {
    const e = created("ingetin bayar listrik tanggal 25");
    expect(e.parsed.title).toBe("Bayar listrik");
    expect(e.parsed.dueAt?.getDate()).toBe(25);
    expect(e.parsed.wantsReminder).toBe(true);
  });

  it("olahraga tiap senin rabu jumat", () => {
    const e = created("olahraga tiap senin rabu jumat");
    expect(e.parsed.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });

  it("revisi vlog besok jam 2 !p1 #konten 90m", () => {
    const e = created("revisi vlog besok jam 2 !p1 #konten 90m");
    expect(e.parsed.title).toBe("Revisi vlog");
    expect(e.parsed.dueAt?.getHours()).toBe(14);
    expect(e.parsed.priority).toBe(1);
    expect(e.parsed.tags).toContain("konten");
    expect(e.parsed.estimateMin).toBe(90);
  });

  it("tanpa aba-aba, ditanya dulu", () => {
    const r = conv().send("beli kopi");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("Mau gue simpen");
  });
});

// ── contekan: lihat & cari ───────────────────────────────────────────────────

describe("README — contekan lihat & cari", () => {
  const tasks: Task[] = [
    makeTask({ id: "t1", userId: "u1", title: "Bikin laporan", dueAt: iso(2026, 8, 8, 9, 0) }),
    makeTask({ id: "t2", userId: "u1", title: "Beli kopi", status: "done", dueAt: iso(2026, 8, 6) }),
    makeTask({ id: "t3", userId: "u1", title: "Kirim invoice", dueAt: iso(2026, 8, 5, 9, 0) }),
    makeTask({ id: "t4", userId: "u1", title: "Zoom sama klien", dueAt: iso(2026, 8, 8, 10, 0) }),
    makeTask({ id: "t5", userId: "u1", title: "Standup tim", dueAt: iso(2026, 8, 8, 11, 0) }),
  ];

  it("tampilin task yang belum selesai", () => {
    const out = textOf(conv({ tasks }).send("tampilin task yang belum selesai"));
    expect(out).toContain("Bikin laporan");
    expect(out).not.toContain("Beli kopi");
  });

  it("tampilin task yang udah selesai", () => {
    expect(textOf(conv({ tasks }).send("tampilin task yang udah selesai"))).toContain("Beli kopi");
  });

  it("tampilin task yang telat", () => {
    expect(textOf(conv({ tasks }).send("tampilin task yang telat"))).toContain("Kirim invoice");
  });

  it("tampilin semua rapat gw — kata generik nyapu kategori", () => {
    const out = textOf(conv({ tasks }).send("tampilin semua rapat gw"));
    expect(out).toContain("Zoom sama klien");
    expect(out).toContain("Standup tim");
  });

  it("tampilin agenda zoom gw — kata spesifik nyaring", () => {
    const out = textOf(conv({ tasks }).send("tampilin agenda zoom gw"));
    expect(out).toContain("Zoom sama klien");
    expect(out).not.toContain("Standup tim");
  });

  it("task, jadwal, dan agenda nyari hal yang sama", () => {
    for (const kata of ["task", "jadwal", "agenda"]) {
      expect(textOf(conv({ tasks }).send(`tampilin ${kata} besok`)), kata).toContain("Bikin laporan");
    }
  });
});

// ── contekan: ubah & hapus ───────────────────────────────────────────────────

describe("README — contekan ubah, selesaikan, hapus", () => {
  const tasks = [makeTask({ id: "t1", userId: "u1", title: "Bikin laporan", dueAt: iso(2026, 8, 7, 9, 0) })];

  it("kelarin task laporan", () => {
    expect(conv({ tasks }).send("kelarin task laporan").effects[0]).toMatchObject({
      type: "PATCH_TASK",
      patch: { status: "done" },
    });
  });

  it("batalin selesai laporan", () => {
    const done = [makeTask({ id: "t1", userId: "u1", title: "Bikin laporan", status: "done" })];
    expect(conv({ tasks: done }).send("batalin selesai laporan").effects[0]).toMatchObject({
      type: "PATCH_TASK",
      patch: { status: "todo" },
    });
  });

  it("ubah task laporan jadi jam 9", () => {
    const e = conv({ tasks }).send("ubah task laporan jadi jam 9").effects[0] as Extract<
      Effect,
      { type: "PATCH_TASK" }
    >;
    expect(e).toMatchObject({ type: "PATCH_TASK", id: "t1" });
    expect(new Date(e.patch.dueAt!).getHours()).toBe(9);
  });

  it("pindahin rapat senin ke selasa", () => {
    const rapat = [makeTask({ id: "r1", userId: "u1", title: "Rapat tim", dueAt: iso(2026, 8, 10, 9, 0) })];
    const e = conv({ tasks: rapat }).send("pindahin rapat senin ke selasa").effects[0] as Extract<
      Effect,
      { type: "PATCH_TASK" }
    >;
    expect(e).toMatchObject({ type: "PATCH_TASK", id: "r1" });
    expect(new Date(e.patch.dueAt!).getDate()).toBe(11); // Selasa
  });

  it("hapus + batal mengembalikan", () => {
    const c = conv({ tasks });
    c.send("hapus task laporan");
    expect(c.send("ya").effects[0]).toMatchObject({ type: "DELETE_TASK" });
    expect(c.send("batal").effects[0]).toMatchObject({ type: "RESTORE_TASK" });
  });
});

// ── contekan: ketersediaan & bantuan ─────────────────────────────────────────

describe("README — ketersediaan & bantuan", () => {
  const blocks: BusyBlock[] = [
    { id: "b1", userId: "u1", title: "Meeting", startAt: iso(2026, 8, 8, 15, 0), endAt: iso(2026, 8, 8, 16, 0) },
  ];

  it("besok jam 3 gw kosong ga? — kepakai", () => {
    expect(textOf(conv({ blocks }).send("besok jam 3 gw kosong ga?"))).toContain("Meeting");
  });

  it("hari ini sore gw luang ga?", () => {
    expect(textOf(conv().send("hari ini sore gw luang ga?"))).toContain("kosong");
  });

  it("task all-day gak bikin sehari penuh dianggap sibuk", () => {
    const tasks = [makeTask({ id: "t1", userId: "u1", title: "Deadline pajak", dueAt: iso(2026, 8, 8), allDay: true })];
    expect(textOf(conv({ tasks }).send("besok jam 3 gw kosong ga?"))).toContain("kosong");
  });

  it("bisa apa aja", () => {
    expect(textOf(conv().send("bisa apa aja"))).toContain("tambahin");
  });
});

// ── tabel "yang dimengerti parser" ───────────────────────────────────────────

describe("README — tabel kemampuan parser", () => {
  const p = (s: string) => parseQuickAdd(s, { now: NOW });
  const hari = (s: string) => p(s).dueAt?.getDate();

  it("tanggal relatif", () => {
    expect(hari("x hari ini")).toBe(7);
    expect(hari("x besok")).toBe(8);
    expect(hari("x lusa")).toBe(9);
    expect(hari("x 3 hari lagi")).toBe(10);
    expect(hari("x dalam 2 minggu")).toBe(21);
  });

  it("tanggal pasti", () => {
    expect(hari("x tanggal 25")).toBe(25);
    expect(hari("x 25 des")).toBe(25);
    expect(hari("x 25/12")).toBe(25);
    expect(p("x 25/12/2027").dueAt?.getFullYear()).toBe(2027);
  });

  it("jam & bentuk khususnya", () => {
    expect(p("x jam 3").dueAt?.getHours()).toBe(15);
    expect(p("x jam 9").dueAt?.getHours()).toBe(9);
    expect(p("x jam 14:30").dueAt?.getMinutes()).toBe(30);
    expect(p("x setengah 3").dueAt?.getMinutes()).toBe(30);
    expect(p("x jam 3 lewat 15").dueAt?.getMinutes()).toBe(15);
    const rentang = p("x jam 2 sampai 4");
    expect(rentang.startAt?.getHours()).toBe(14);
    expect(rentang.endAt?.getHours()).toBe(16);
  });

  it("perkiraan & durasi", () => {
    expect(p("x jam 3an").approxTime).toBe(true);
    expect(p("x sekitar jam 3").approxTime).toBe(true);
    expect(p("x 90 menit").estimateMin).toBe(90);
    expect(p("x 2 jam").estimateMin).toBe(120);
    expect(p("x 90m").estimateMin).toBe(90);
    expect(p("x setengah jam").estimateMin).toBe(30);
    expect(p("x sebentar").estimateMin).toBeGreaterThan(0);
  });

  it("pengulangan", () => {
    expect(p("x tiap hari").recurrence).toBe("FREQ=DAILY");
    expect(p("x tiap hari kerja").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(p("x tiap 2 minggu").recurrence).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(p("x tiap tanggal 25").recurrence).toBe("FREQ=MONTHLY;BYMONTHDAY=25");
  });

  it("token bertanda", () => {
    expect(p("x !p1").priority).toBe(1);
    expect(p("x !!").priority).toBe(1);
    expect(p("x #konten").tags).toContain("konten");
    expect(p("x @kerja").project).toBe("kerja");
    expect(p("x ~berat").energy).toBe("high");
    expect(p("x *30m").reminderMin).toBe(30);
    expect(p("x +riset +tulis draf").subtasks).toEqual(["riset", "tulis draf"]);
    expect(p("beli kopi // yang arabica").notes).toBe("yang arabica");
  });

  it('tanda kutip mengunci teks biar gak dibaca sebagai waktu', () => {
    expect(p('rapat "jam 5"').title).toContain("jam 5");
  });
});
