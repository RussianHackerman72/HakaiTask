/**
 * Suite Tahap 2–4 — PLAN-CHAT.md §21.
 *
 * Yang dites di sini adalah PERILAKU PERCAKAPAN, bukan potongan fungsi:
 * ambiguitas, konfirmasi, undo, dan kamus pribadi cuma kelihatan benar kalau
 * diuji beberapa giliran berturut-turut. Semuanya jalan tanpa React, tanpa
 * DOM, tanpa jaringan — itu inti dari keputusan "chatTurn() murni" (§18).
 *
 * Acuan waktu: Jumat, 7 Agustus 2026, 10:00.
 */
import { describe, expect, it } from "vitest";
import { makeTask, type BusyBlock, type Task } from "../types.js";
import { chatTurn, openingMessage, type ChatContext, type Effect, type Pending } from "./machine.js";
import { expandBlock } from "./recur.js";
import { queryItems } from "./query.js";
import { expandVocab, validateTeach, type VocabEntry } from "./vocab.js";
import { analyze, isKnownWord } from "./intent.js";
import { resolveDateRange } from "./range.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0); // Jumat 7 Agu 2026

function iso(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

function task(id: string, title: string, extra: Partial<Task> = {}): Task {
  return makeTask({ id, userId: "u1", title, ...extra });
}

function block(id: string, title: string, startAt: string, endAt: string, recurrence?: string): BusyBlock {
  return { id, userId: "u1", title, startAt, endAt, ...(recurrence ? { recurrence } : {}) };
}

function ctx(over: Partial<ChatContext> = {}): ChatContext {
  return {
    now: NOW,
    tasks: [],
    blocks: [],
    vocab: [],
    pending: null,
    userName: "Kai",
    ...over,
  };
}

/** Percakapan beruntun — pending diteruskan antar giliran, seperti aslinya. */
function conv(base: Partial<ChatContext> = {}) {
  let pending: Pending = null;
  const effects: Effect[] = [];
  return {
    send(input: string) {
      const r = chatTurn(input, { ...ctx(base), pending });
      pending = r.pending;
      effects.push(...r.effects);
      return r;
    },
    get effects() {
      return effects;
    },
    get pending() {
      return pending;
    },
  };
}

function textOf(r: { messages: { text: string }[] }): string {
  return r.messages.map((m) => m.text).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────

describe("pengulangan — T8/E2, blok berulang harus muncul di hari berikutnya", () => {
  const standup = block("b1", "Standup", iso(2026, 8, 3, 9, 0), iso(2026, 8, 3, 9, 15), "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");

  it("hari kerja: muncul di Senin berikutnya, bukan cuma tanggal aslinya", () => {
    const occ = expandBlock(standup, resolveDateRange("senin", NOW)!);
    expect(occ).toHaveLength(1);
    expect(new Date(occ[0]!.startAt).getDate()).toBe(10);
    expect(occ[0]!.repeated).toBe(true);
  });

  it("gak muncul di akhir pekan", () => {
    expect(expandBlock(standup, resolveDateRange("besok", NOW)!)).toHaveLength(0); // Sabtu
  });

  it("lima kali dalam seminggu kerja", () => {
    expect(expandBlock(standup, resolveDateRange("minggu depan", NOW)!)).toHaveLength(5);
  });

  it("harian tiap 2 hari — INTERVAL dihormati", () => {
    const b = block("b2", "Minum obat", iso(2026, 8, 3, 8, 0), iso(2026, 8, 3, 8, 15), "FREQ=DAILY;INTERVAL=2");
    const occ = expandBlock(b, resolveDateRange("minggu ini", NOW)!);
    expect(occ.map((o) => new Date(o.startAt).getDate())).toEqual([3, 5, 7, 9]);
  });

  it("bulanan pada tanggal tertentu", () => {
    const b = block("b3", "Bayar kos", iso(2026, 1, 25, 9, 0), iso(2026, 1, 25, 9, 30), "FREQ=MONTHLY;BYMONTHDAY=25");
    const occ = expandBlock(b, resolveDateRange("bulan ini", NOW)!);
    expect(occ).toHaveLength(1);
    expect(new Date(occ[0]!.startAt).getDate()).toBe(25);
  });

  it("E19 — agenda lewat tengah malam kehitung di dua hari yang dilewatinya", () => {
    const b = block("b4", "Jaga malam", iso(2026, 8, 7, 23, 0), iso(2026, 8, 8, 1, 0));
    expect(expandBlock(b, resolveDateRange("hari ini", NOW)!)).toHaveLength(1);
    expect(expandBlock(b, resolveDateRange("besok", NOW)!)).toHaveLength(1);
  });

  it("tanpa pengulangan cuma sekali", () => {
    const b = block("b5", "Wisuda", iso(2026, 8, 10, 8, 0), iso(2026, 8, 10, 12, 0));
    expect(expandBlock(b, resolveDateRange("minggu depan", NOW)!)).toHaveLength(1);
  });
});

describe("penyaringan", () => {
  const tasks = [
    task("t1", "Bikin laporan", { dueAt: iso(2026, 8, 7, 9, 0) }),
    task("t2", "Revisi vlog", { dueAt: iso(2026, 8, 8, 14, 0) }),
    task("t3", "Beli kopi", { status: "done", completedAt: iso(2026, 8, 6) }),
    task("t4", "Rapat tim sync", { dueAt: iso(2026, 8, 6, 9, 0) }),
    task("t5", "Task tanpa tanggal"),
  ];

  it("tanpa filter status, yang udah selesai disembunyiin", () => {
    const res = queryItems(ctx({ tasks }), {});
    expect(res.tasks.map((t) => t.id)).not.toContain("t3");
  });

  it("status done nampilin yang selesai", () => {
    expect(queryItems(ctx({ tasks }), { status: "done" }).tasks.map((t) => t.id)).toEqual(["t3"]);
  });

  it("overdue = lewat tenggat & belum selesai", () => {
    const res = queryItems(ctx({ tasks }), { status: "overdue" });
    expect(res.tasks.map((t) => t.id)).toEqual(["t4", "t1"]);
  });

  it("rentang nyaring pakai dueAt", () => {
    const res = queryItems(ctx({ tasks }), { range: resolveDateRange("besok", NOW)! });
    expect(res.tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("task terhapus & terarsip gak pernah muncul", () => {
    const extra = [...tasks, task("t9", "Hantu", { deletedAt: iso(2026, 8, 1) })];
    expect(queryItems(ctx({ tasks: extra }), {}).tasks.map((t) => t.id)).not.toContain("t9");
  });

  it("grup topik cocok per kata, bukan potongan huruf", () => {
    const res = queryItems(ctx({ tasks }), { topic: "rapat" });
    expect(res.tasks.map((t) => t.id)).toEqual(["t4"]);
  });

  it("yang gak punya waktu ditaruh paling belakang", () => {
    const res = queryItems(ctx({ tasks }), {});
    expect(res.tasks[res.tasks.length - 1]!.id).toBe("t5");
  });
});

describe("alur — bikin", () => {
  it("bikin task, jalur tetap milik parseQuickAdd", () => {
    const c = conv();
    const r = c.send("tambahin task bikin laporan besok jam 9");
    expect(r.effects[0]!.type).toBe("CREATE_FROM_PARSE");
    expect(textOf(r)).toContain("Bikin laporan");
  });

  it("sigil !p1 tetap kepake gratis dari chat", () => {
    const r = conv().send("tambahin revisi vlog besok jam 2 !p1");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.parsed.priority).toBe(1);
  });

  it("E8 — judul kosong gak pernah bikin task sampah", () => {
    const r = conv().send("tambahin besok jam 3");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("Mau nambahin apa");
  });
});

describe("alur — lihat", () => {
  const tasks = [task("t1", "Bikin laporan", { dueAt: iso(2026, 8, 8, 9, 0) })];

  it("'agenda' berarti SEMUA — task dan jadwal digabung", () => {
    const blocks = [block("b1", "Meeting Client A", iso(2026, 8, 8, 15, 0), iso(2026, 8, 8, 16, 0))];
    const out = textOf(conv({ tasks, blocks }).send("apa aja agenda gw besok?"));
    expect(out).toContain("Bikin laporan");
    expect(out).toContain("Meeting Client A");
  });

  it("'jadwal', 'task', dan 'agenda' nemu hal yang sama", () => {
    const blocks = [block("b1", "Meeting Client A", iso(2026, 8, 8, 15, 0), iso(2026, 8, 8, 16, 0))];
    for (const kata of ["jadwal", "task", "agenda"]) {
      const out = textOf(conv({ tasks, blocks }).send(`tampilin ${kata} gw besok`));
      expect(out, kata).toContain("Meeting Client A");
      expect(out, kata).toContain("Bikin laporan");
    }
  });

  it("nanya task besok", () => {
    const r = conv({ tasks }).send("apa aja task gw besok?");
    expect(textOf(r)).toContain("Bikin laporan");
  });

  it("hasil kosong bilang kosong, bukan error", () => {
    expect(textOf(conv({ tasks }).send("tampilin task lusa"))).toContain("Gak ada");
  });

  it("balasan bawa refs yang bisa diketuk", () => {
    const r = conv({ tasks }).send("tampilin task besok");
    expect(r.messages[0]!.refs?.[0]!.id).toBe("t1");
  });
});

describe("alur — selesaiin", () => {
  const tasks = [task("t1", "Bikin laporan", { dueAt: iso(2026, 8, 7, 9, 0) })];

  it("satu kandidat langsung jalan", () => {
    const r = conv({ tasks }).send("selesaiin laporan");
    expect(r.effects).toEqual([
      { type: "PATCH_TASK", id: "t1", patch: { status: "done", completedAt: NOW.toISOString() } },
    ]);
  });

  it("E12 — nyentang yang udah selesai itu idempoten, bukan error", () => {
    const done = [task("t1", "Bikin laporan", { status: "done" })];
    const r = conv({ tasks: done }).send("selesaiin laporan");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("udah selesai");
  });

  it("gak ketemu", () => {
    expect(textOf(conv({ tasks }).send("selesaiin sesuatu yang gak ada"))).toContain("Gak nemu");
  });
});

describe("alur — ambiguitas lalu dipilih", () => {
  const blocks = [
    block("b1", "Meeting Client A", iso(2026, 8, 8, 10, 0), iso(2026, 8, 8, 11, 0)),
    block("b2", "Meeting Internal", iso(2026, 8, 8, 15, 0), iso(2026, 8, 8, 16, 0)),
  ];

  it("dua kandidat → daftar bernomor, sistem gak milih sendiri", () => {
    const r = conv({ blocks }).send("ubah meeting gw besok");
    expect(textOf(r)).toContain("Yang mana?");
    expect(textOf(r)).toContain("1.");
    expect(textOf(r)).toContain("2.");
    expect(r.effects).toHaveLength(0);
  });

  it("E5 — 'yang nomor 1' kebaca pilihan, lalu diminta waktu barunya", () => {
    const c = conv({ blocks });
    c.send("ubah meeting gw besok");
    const r = c.send("yang nomor 1");
    expect(textOf(r)).toContain("Meeting Client A");
    expect(textOf(r)).toContain("kapan");
  });

  it("percakapan penuh sampai jadwal berubah", () => {
    const c = conv({ blocks });
    c.send("ubah meeting gw besok");
    c.send("yang nomor 1");
    const r = c.send("jam 4");
    const e = r.effects[0] as Extract<Effect, { type: "PATCH_BUSY" }>;
    expect(e.type).toBe("PATCH_BUSY");
    expect(e.id).toBe("b1");
    expect(new Date(e.patch.startAt!).getHours()).toBe(16);
  });

  it("angka telanjang '1' juga kebaca sebagai pilihan, bukan jam", () => {
    const c = conv({ blocks });
    c.send("ubah meeting gw besok");
    expect(textOf(c.send("1"))).toContain("Meeting Client A");
  });

  it("nomor di luar jangkauan ditolak, pending tetap hidup", () => {
    const c = conv({ blocks });
    c.send("ubah meeting gw besok");
    expect(textOf(c.send("nomor 9"))).toContain("Cuma ada 2");
    expect(c.pending?.kind).toBe("choose");
  });
});

describe("alur — hapus, konfirmasi, undo", () => {
  const tasks = [task("t1", "Bikin laporan", { dueAt: iso(2026, 8, 7, 9, 0) })];

  it("hapus minta konfirmasi dulu, gak langsung jalan", () => {
    const r = conv({ tasks }).send("hapus task laporan");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("Hapus");
    expect(r.pending?.kind).toBe("confirm");
  });

  it("'ya' baru bikin efek hapus", () => {
    const c = conv({ tasks });
    c.send("hapus task laporan");
    const r = c.send("ya");
    expect(r.effects).toEqual([{ type: "DELETE_TASK", id: "t1" }]);
  });

  it("'batal' membatalkan tanpa efek apa pun", () => {
    const c = conv({ tasks });
    c.send("hapus task laporan");
    const r = c.send("batal");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("gak jadi");
  });

  it("setelah kehapus, 'batal' mengembalikan (tombstone bikin undo murah)", () => {
    const c = conv({ tasks });
    c.send("hapus task laporan");
    c.send("ya");
    const r = c.send("batal");
    expect(r.effects).toEqual([{ type: "RESTORE_TASK", id: "t1" }]);
  });

  it("massal nampilin daftar lengkap sebelum konfirmasi, bukan cuma jumlah", () => {
    const blocks = [
      block("b1", "Meeting Client A", iso(2026, 8, 3, 10, 0), iso(2026, 8, 3, 11, 0)),
      block("b2", "Sync tim", iso(2026, 8, 5, 14, 0), iso(2026, 8, 5, 15, 0)),
    ];
    const r = conv({ blocks }).send("hapus semua meeting minggu ini");
    expect(textOf(r)).toContain("Meeting Client A");
    expect(textOf(r)).toContain("Sync tim");
    expect(r.effects).toHaveLength(0);
  });
});

describe("alur — ketersediaan waktu", () => {
  const blocks = [block("b1", "Meeting Client A", iso(2026, 8, 8, 15, 0), iso(2026, 8, 8, 16, 0))];

  it("kosong", () => {
    expect(textOf(conv({ blocks }).send("besok jam 8 gw kosong ga?"))).toContain("kosong");
  });

  it("kepakai — sebut agendanya", () => {
    expect(textOf(conv({ blocks }).send("besok jam 3 gw kosong ga?"))).toContain("Meeting Client A");
  });

  it("E4 — task all-day gak bikin satu hari dianggap sibuk", () => {
    const tasks = [task("t1", "Deadline pajak", { dueAt: iso(2026, 8, 8), allDay: true })];
    expect(textOf(conv({ tasks }).send("besok jam 3 gw kosong ga?"))).toContain("kosong");
  });
});

describe("kamus pribadi — ekspansi", () => {
  const vocab: VocabEntry[] = [
    { id: "v1", phrase: "clientan", meaning: "meeting client", type: "alias" },
    { id: "v2", phrase: "urusan kampus", meaning: "jadwal kuliah", type: "filter" },
    { id: "v3", phrase: "kampus", meaning: "kuliah", type: "filter" },
  ];

  it("frasa satu kata", () => {
    expect(expandVocab(["besok", "ada", "clientan"], vocab).words).toEqual([
      "besok", "ada", "meeting", "client",
    ]);
  });

  it("§6.5 — frasa terpanjang menang", () => {
    expect(expandVocab(["urusan", "kampus"], vocab).words).toEqual(["jadwal", "kuliah"]);
  });

  it("§5.3 — sekali jalan, hasil ekspansi gak diekspansi lagi", () => {
    const loopy: VocabEntry[] = [
      { id: "a", phrase: "a", meaning: "b", type: "alias" },
      { id: "b", phrase: "b", meaning: "a", type: "alias" },
    ];
    // Kalau rekursif, ini gak bakal pernah berhenti.
    expect(expandVocab(["a"], loopy).words).toEqual(["b"]);
  });

  it("nyatet asal-usul buat ditampilin ke user", () => {
    expect(expandVocab(["clientan"], vocab).applied).toEqual([
      { phrase: "clientan", meaning: "meeting client" },
    ]);
  });
});

describe("kamus pribadi — validasi", () => {
  const base = { vocab: [] as VocabEntry[], now: NOW };

  it("§6.3 — kata perintah merusak ditolak", () => {
    const v = validateTeach("hapus", "buka kalender", base);
    expect(v.ok).toBe(false);
    expect(v.error?.code).toBe("phrase_reserved");
  });

  it("§6.4 — meta percakapan ditolak, biar user gak kekunci", () => {
    expect(validateTeach("batal", "sesuatu", base).ok).toBe(false);
  });

  it("§7.1 — frasa yang berarti waktu ditolak", () => {
    const v = validateTeach("minggu depan", "gym", base);
    expect(v.ok).toBe(false);
    expect(v.error?.code).toBe("phrase_waktu");
  });

  it("siklus ditolak", () => {
    expect(validateTeach("clientan", "clientan client", base).error?.code).toBe("meaning_siklus");
  });

  it("arti kepanjangan ditolak", () => {
    expect(validateTeach("x", "satu dua tiga empat lima enam tujuh", base).error?.code).toBe("meaning_panjang");
  });

  it("V1 — nimpa kata bawaan DIPERINGATKAN, bukan diblokir", () => {
    const v = validateTeach("beresin", "selesaiin", base);
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => w.code)).toContain("nimpa_bawaan");
    expect(v.warnings[0]!.message).toContain("beresin meja");
  });

  it("§16.2 — arti yang menghapus data dapet peringatan tegas", () => {
    const v = validateTeach("nuke", "hapus semua task", base);
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => w.code)).toContain("merusak");
  });

  it("frasa yang udah ada ditawarin buat ditimpa", () => {
    const vocab: VocabEntry[] = [{ id: "v1", phrase: "clientan", meaning: "meeting client", type: "alias" }];
    expect(validateTeach("clientan", "gym", { vocab, now: NOW }).existing?.meaning).toBe("meeting client");
  });
});

describe("kamus pribadi — alur percakapan", () => {
  it("§3.1 — pola langsung, dikonfirmasi, lalu disimpan", () => {
    const c = conv();
    const r1 = c.send("kalau gw bilang clientan, maksudnya meeting client");
    expect(textOf(r1)).toContain("Simpan ini?");
    expect(r1.effects).toHaveLength(0);

    const r2 = c.send("ya");
    expect(r2.effects).toEqual([
      { type: "SAVE_VOCAB", phrase: "clientan", meaning: "meeting client", vocabType: "filter" },
    ]);
  });

  it("§3.2 — mode dipandu", () => {
    const c = conv();
    expect(textOf(c.send("gw mau ngajarin lu sesuatu"))).toContain("istilahnya apa");
    expect(textOf(c.send("clientan"))).toContain("artinya apa");
    expect(textOf(c.send("meeting client"))).toContain("Simpan ini?");
    expect(c.send("ya").effects[0]!.type).toBe("SAVE_VOCAB");
  });

  it("§3.4 — bisa dibatalkan, gak nyimpen apa pun", () => {
    const c = conv();
    c.send("kalau gw bilang clientan, maksudnya meeting client");
    expect(c.send("batal").effects).toHaveLength(0);
  });

  it("§12 — konfirmasi nampilin peringatan nimpa kata bawaan", () => {
    const r = conv().send("kalau gw bilang beresin, maksudnya selesaiin");
    expect(textOf(r)).toContain("beresin meja");
  });

  it("istilah yang diajarin langsung kepake di perintah berikutnya", () => {
    const vocab: VocabEntry[] = [{ id: "v1", phrase: "clientan", meaning: "meeting client", type: "alias" }];
    const blocks = [block("b1", "Meeting Client A", iso(2026, 8, 8, 15, 0), iso(2026, 8, 8, 16, 0))];
    const r = conv({ vocab, blocks }).send("besok gw ada clientan gak?");
    expect(textOf(r)).toContain("Meeting Client A");
    expect(textOf(r)).toContain("dari kamus kamu");
  });

  it("§11.1 — istilah asing + hasil nol → tawarin ngajarin", () => {
    const c = conv();
    const r = c.send("besok gw ada clientan gak?");
    expect(textOf(r)).toContain("belum ngerti");
    expect(c.pending?.kind).toBe("offerTeach");
  });

  it("ketuk tombol tawaran langsung ke pertanyaan ARTI, gak nanya ulang istilahnya", () => {
    const c = conv();
    const r = c.send("besok gw ada clientan gak?");
    const label = r.messages[0]!.choices![0]!; // `ajarin "clientan"`
    const next = c.send(label);
    expect(textOf(next)).toContain("artinya apa");
    expect(textOf(next)).toContain("clientan");
  });

  it("tolak tawaran = gak nyimpen apa pun", () => {
    const c = conv();
    c.send("besok gw ada clientan gak?");
    expect(c.send("gak usah").effects).toHaveLength(0);
  });

  it("§11.1 — di perintah BIKIN, kata asing gak mancing tawaran apa pun", () => {
    const r = conv().send("tambahin task clientan besok");
    expect(textOf(r)).not.toContain("belum ngerti");
    expect(r.effects[0]!.type).toBe("CREATE_FROM_PARSE");
  });

  it("V2 — judul tetap kata user sendiri, bukan hasil ekspansi", () => {
    const vocab: VocabEntry[] = [{ id: "v1", phrase: "clientan", meaning: "meeting client", type: "alias" }];
    const r = conv({ vocab }).send("tambahin task clientan besok");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.parsed.title.toLowerCase()).toContain("clientan");
  });

  it("lihat & hapus entri lewat chat", () => {
    const vocab: VocabEntry[] = [{ id: "v1", phrase: "clientan", meaning: "meeting client", type: "alias" }];
    expect(textOf(conv({ vocab }).send("tampilin vocabulary gw"))).toContain("clientan");
    expect(conv({ vocab }).send("hapus vocabulary clientan").effects).toEqual([
      { type: "DELETE_VOCAB", id: "v1" },
    ]);
  });
});

/**
 * Ketiganya dilaporkan dari layar asli: user nanya jadwal Senin, lihat ada
 * isinya, lalu dua percobaan hapus berturut-turut dijawab "gak nemu".
 */
describe("regresi — laporan bug 'hapus task di hari itu'", () => {
  const blocks = [block("b1", "Bangun subuh", iso(2026, 8, 10, 5, 0), iso(2026, 8, 10, 5, 30))];
  const tasks = [task("t1", "Bikin laporan", { dueAt: iso(2026, 8, 10, 9, 0) })];

  it("'hari' gak boleh nyangkut jadi kata kunci — dia nyaring habis semua hasil", () => {
    expect(analyze("hapus semua task di hari itu", NOW).keyword).toBe("");
  });

  it("'di hari itu' nyambung ke rentang yang barusan dibahas", () => {
    const c = conv({ tasks, blocks });
    const first = c.send("apa aja jadwal gw di hari senin");
    expect(textOf(first)).toContain("Bangun subuh");

    const second = c.send("hapus semua task di hari itu");
    expect(textOf(second)).toContain("Bikin laporan");
    expect(textOf(second)).not.toContain("Gak nemu");
  });

  it("tanpa acuan sebelumnya, 'hari itu' gak ngarang tanggal sendiri", () => {
    // Boleh nyari ke semua task — yang gak boleh itu diam-diam ngeklaim hari
    // tertentu padahal belum ada yang nyebut.
    const out = textOf(conv({ tasks, blocks }).send("hapus task di hari itu"));
    expect(out).not.toContain("Senin");
  });

  it("'hapus task hari senin' nemu apa pun yang ada di Senin", () => {
    expect(textOf(conv({ blocks }).send("hapus task hari senin"))).toContain("Bangun subuh");
  });

  it("kalau emang kosong, tetap pesan biasa", () => {
    expect(textOf(conv().send("hapus task hari senin"))).toContain("Gak nemu");
  });
});

describe("regresi — kebocoran kata ke judul", () => {
  it("kata perintah kedua gak ikut ke judul", () => {
    const r = conv().send("jadwalin buat bangun subuh");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.parsed.title).toBe("Bangun");
  });

  it("ekspresi jam kedua gak ikut ke judul", () => {
    const r = conv().send("jadwalin buat bangun subuh jam 5");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.parsed.title).toBe("Bangun");
  });

  it("judul yang isinya cuma kata struktural gak dikosongin", () => {
    const r = conv().send("tambahin task");
    expect(textOf(r)).toContain("Mau nambahin apa");
  });

  it("angka telanjang gak jadi task — biasanya ketikan nyasar / ordinal telat", () => {
    const r = conv().send("1");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("belum bisa itu");
  });

  it("angka yang nempel huruf tetap judul yang sah", () => {
    const r = conv().send("tambahin bayar 5k");
    expect(r.effects[0]!.type).toBe("CREATE_FROM_PARSE");
  });

  it("judul normal gak ikut kepangkas", () => {
    const r = conv().send("tambahin task bikin laporan besok jam 9");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.parsed.title).toBe("Bikin laporan");
  });
});

describe("regresi — laporan bug 'agenda zoom' & 'semua jadwal'", () => {
  const blocks = [
    block("b1", "Zoom sama klien", iso(2026, 8, 10, 10, 0), iso(2026, 8, 10, 11, 0)),
    block("b2", "Standup pagi", iso(2026, 8, 10, 9, 0), iso(2026, 8, 10, 9, 15)),
  ];

  it("kata yang ADA di kamus bawaan gak boleh ditawarin buat diajarin", () => {
    // "zoom" ada di nounSchedule sekaligus grup topik `rapat`
    expect(isKnownWord("zoom")).toBe(true);
    expect(isKnownWord("clientan")).toBe(false);
  });

  it("nyari nama agenda spesifik cuma balikin yang cocok, bukan semua rapat", () => {
    const out = textOf(conv({ blocks }).send("tampilin semua agenda zoom gw"));
    expect(out).toContain("Zoom sama klien");
    expect(out).not.toContain("Standup pagi");
    expect(out).not.toContain("belum ngerti");
  });

  it("kata generik tetap nyapu satu kategori", () => {
    const out = textOf(conv({ blocks }).send("tampilin semua meeting gw"));
    expect(out).toContain("Zoom sama klien");
    expect(out).toContain("Standup pagi");
  });

  it("'semua jadwal' ikut nampilin yang udah lewat", () => {
    const lewat = [block("b9", "Bangun subuh", iso(2026, 8, 3, 5, 0), iso(2026, 8, 3, 5, 30))];
    expect(textOf(conv({ blocks: lewat }).send("tampilin semua jadwal gw"))).toContain("Bangun subuh");
  });

  it("agenda pagi ini tetap kehitung walau ditanya malamnya", () => {
    const malam = new Date(2026, 7, 7, 22, 0, 0); // Jumat malam
    const pagi = [block("b8", "Bangun subuh", iso(2026, 8, 7, 5, 0), iso(2026, 8, 7, 5, 30))];
    const r = chatTurn("tampilin jadwal gw", { ...ctx({ blocks: pagi }), now: malam });
    expect(textOf(r)).toContain("Bangun subuh");
  });
});

describe("regresi — 'rabu besok' itu penekanan, bukan lompat sepekan", () => {
  it("rabu besok = Rabu terdekat, sama kayak 'rabu'", () => {
    expect(resolveDateRange("rabu besok", NOW)?.from.getDate()).toBe(
      resolveDateRange("rabu", NOW)?.from.getDate(),
    );
  });

  it("'rabu depan' tetap lompat sepekan", () => {
    const dekat = resolveDateRange("rabu", NOW)!.from;
    const depan = resolveDateRange("rabu depan", NOW)!.from;
    expect(depan.getTime() - dekat.getTime()).toBe(7 * 86_400_000);
  });

  it("query 'jadwal hari rabu besok' nemu agenda di Rabu terdekat", () => {
    const blocks = [block("b1", "Kelas pagi", iso(2026, 8, 12, 8, 0), iso(2026, 8, 12, 10, 0))];
    expect(textOf(conv({ blocks }).send("tampilin jadwal hari rabu besok"))).toContain("Kelas pagi");
  });
});

/**
 * Kalender gak punya kolom ketik lagi — tombolnya nitip teks awal ke chat.
 * Format tanggalnya harus yang beneran dimengerti parser, kalau enggak
 * task-nya mendarat di hari yang salah tanpa ada yang sadar.
 */
describe("titipan teks dari kalender", () => {
  it("'tambahin 12 agustus <judul>' mendarat di tanggal yang bener", () => {
    const r = conv().send("tambahin 12 agustus beli kopi");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.type).toBe("CREATE_FROM_PARSE");
    expect(e.parsed.title).toBe("Beli kopi");
    expect(e.parsed.dueAt?.getDate()).toBe(12);
    expect(e.parsed.dueAt?.getMonth()).toBe(7); // Agustus
  });

  it("tiap nama bulan kepakai kebaca parser", () => {
    const bulan = [
      "januari", "februari", "maret", "april", "mei", "juni",
      "juli", "agustus", "september", "oktober", "november", "desember",
    ];
    for (const [i, nama] of bulan.entries()) {
      const r = conv().send(`tambahin 12 ${nama} tes`);
      const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
      expect(e?.parsed.dueAt?.getMonth(), nama).toBe(i);
    }
  });

  it("titipan tanpa judul cuma nanya, gak bikin task kosong", () => {
    expect(conv().send("tambahin 12 agustus").effects).toHaveLength(0);
  });
});

/**
 * Dilaporin dari pemakaian nyata: "tampilin jadwal hari rabu" dijawab "gak
 * ada" padahal hari itu ada isinya — cuma tersimpan sebagai task.
 *
 * Dibenerin di akarnya: task & jadwal disatuin, jadi seluruh kelas kegagalan
 * "kesimpen di jenis A, dicari pakai kata jenis B" jadi mustahil.
 */
describe("regresi — task & jadwal disatuin", () => {
  const tasks = [task("t1", "Kelas pagi", { dueAt: iso(2026, 8, 12, 8, 0) })];
  const blocks = [block("b1", "Standup", iso(2026, 8, 12, 9, 0), iso(2026, 8, 12, 9, 15))];

  it("nanya 'jadwal' nemu task", () => {
    expect(textOf(conv({ tasks }).send("tampilin jadwal hari rabu"))).toContain("Kelas pagi");
  });

  it("nanya 'task' nemu jadwal lama", () => {
    expect(textOf(conv({ blocks }).send("tampilin task hari rabu"))).toContain("Standup");
  });

  it("dua-duanya kebaca sekaligus", () => {
    const out = textOf(conv({ tasks, blocks }).send("tampilin agenda hari rabu"));
    expect(out).toContain("Kelas pagi");
    expect(out).toContain("Standup");
  });

  it("beneran kosong tetap dibilang kosong", () => {
    expect(textOf(conv().send("tampilin jadwal hari rabu"))).toContain("Gak ada agenda");
  });

  it("bikin lewat kata 'rapat' tetap jadi TASK, bukan jenis terpisah", () => {
    const r = conv().send("jadwalin rapat sama klien besok jam 3");
    const e = r.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    expect(e.parsed.kind).toBe("task");
  });

  it("bikin pakai 'rapat' langsung ketemu waktu dicari pakai 'task'", () => {
    const dibikin = conv().send("jadwalin rapat sama klien besok jam 3");
    const e = dibikin.effects[0] as Extract<Effect, { type: "CREATE_FROM_PARSE" }>;
    const dibuat = task("baru", e.parsed.title, { dueAt: e.parsed.dueAt!.toISOString() });
    expect(textOf(conv({ tasks: [dibuat] }).send("tampilin task besok"))).toContain(e.parsed.title);
  });
});

/**
 * Dilaporin dari layar asli: "ok terimakasih" kesimpen jadi task berjudul
 * "Terimakasih". Bikin itu MUTASI — gak boleh kejadian cuma gara-gara
 * kalimatnya nyisain kata.
 */
describe("regresi — basa-basi gak boleh jadi task", () => {
  it("'ok terimakasih' dijawab pendek, nol efek", () => {
    const r = conv().send("ok terimakasih");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toBe("Sama-sama.");
  });

  it("sapaan & seruan juga gak ninggalin jejak", () => {
    for (const s of ["halo", "sip", "mantap", "wkwk", "makasih ya"]) {
      const r = conv().send(s);
      expect(r.effects, s).toHaveLength(0);
    }
  });

  it("kalimat tanpa aba-aba ditanya dulu, gak langsung disimpen", () => {
    const c = conv();
    const r = c.send("beli kopi");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("Mau gue simpen");
    expect(textOf(r)).toContain("Beli kopi");
    expect(c.pending?.kind).toBe("confirmCreate");
  });

  it("dijawab 'ya' baru kesimpen", () => {
    const c = conv();
    c.send("beli kopi");
    expect(c.send("ya").effects[0]!.type).toBe("CREATE_FROM_PARSE");
  });

  it("dijawab 'batal' gak nyimpen apa pun", () => {
    const c = conv();
    c.send("beli kopi");
    expect(c.send("batal").effects).toHaveLength(0);
  });

  it("ada aba-aba bikin → langsung jalan, gak usah ditanya", () => {
    expect(conv().send("tambahin beli kopi").effects[0]!.type).toBe("CREATE_FROM_PARSE");
  });

  it("ada waktu → juga langsung jalan, waktunya itu aba-abanya", () => {
    expect(conv().send("beli kopi besok jam 9").effects[0]!.type).toBe("CREATE_FROM_PARSE");
  });

  it("titipan dari kalender tetap langsung jalan", () => {
    expect(conv().send("tambahin 12 agustus beli kopi").effects[0]!.type).toBe("CREATE_FROM_PARSE");
  });

  it("pertanyaan tetap kebaca query, bukan tawaran nyimpen", () => {
    expect(conv().send("apa aja task gw hari ini?").effects).toHaveLength(0);
    expect(textOf(conv().send("apa aja task gw hari ini?"))).not.toContain("Mau gue simpen");
  });
});

/**
 * Dua laporan dari layar asli, sehari setelah dipakai beneran.
 */
describe("regresi — kata waktu di dalam JUDUL", () => {
  const tasks = [
    task("t1", "Makan malam", { dueAt: iso(2026, 8, 10, 20, 0) }),
    task("t2", "Lari pagi", { dueAt: iso(2026, 8, 11, 6, 0) }),
  ];

  it("'selesaikan makan malam' nemu task-nya, bukan nyaring ke petang ini", () => {
    expect(conv({ tasks }).send("selesaikan makan malam").effects[0]).toMatchObject({
      type: "PATCH_TASK",
      id: "t1",
      patch: { status: "done" },
    });
  });

  it("huruf besar gak ngaruh", () => {
    expect(conv({ tasks }).send("selesaikan Makan malam").effects[0]).toMatchObject({ id: "t1" });
  });

  it("'lari pagi' juga aman", () => {
    expect(conv({ tasks }).send("selesaiin lari pagi").effects[0]).toMatchObject({ id: "t2" });
  });

  it("tapi bagian hari SENDIRIAN tetap nyaring waktu", () => {
    expect(analyze("tampilin agenda sore", NOW).range?.label).toBe("hari ini sore");
    expect(analyze("sore gw kosong ga?", NOW).range?.label).toBe("hari ini sore");
  });

  it("acuan hari beneran tetap kepakai walau ada kata waktu di judul", () => {
    const a = analyze("selesaikan makan malam besok", NOW);
    expect(a.range?.label).toBe("besok");
  });
});

describe("regresi — jawaban 'yang mana?' gak boleh bikin task baru", () => {
  const tasks = [
    task("c1", "Agenda makan bareng keluarga", { dueAt: iso(2026, 8, 8, 11, 0) }),
    task("c2", "Makan enak", { dueAt: iso(2026, 8, 9, 0, 0) }),
    task("c3", "Makan malam", { dueAt: iso(2026, 8, 10, 20, 0) }),
  ];

  it("jawaban pakai TANGGAL nunjuk kandidat yang bener", () => {
    const c = conv({ tasks });
    expect(textOf(c.send("selesaiin makan"))).toContain("Yang mana?");
    const r = c.send("senin 10 agustus");
    expect(r.effects[0]).toMatchObject({ type: "PATCH_TASK", id: "c3" });
  });

  it("tanggal yang BARU LEWAT juga kena — user nunjuk yang udah ada, bukan bikin baru", () => {
    // NOW = 7 Agu. Kandidat di 5 Agu (kemarin lusa) — "5 agustus" telanjang
    // diartikan tahun depan kalau gak ada penanganan khusus.
    const lampau = [
      task("p1", "Makan siang", { dueAt: iso(2026, 8, 5, 12, 0) }),
      task("p2", "Makan enak", { dueAt: iso(2026, 8, 6, 12, 0) }),
    ];
    const c = conv({ tasks: lampau });
    c.send("selesaiin makan");
    expect(c.send("5 agustus").effects[0]).toMatchObject({ type: "PATCH_TASK", id: "p1" });
  });

  it("jawaban pakai JUDUL juga jalan", () => {
    const c = conv({ tasks });
    c.send("selesaiin makan");
    expect(c.send("makan enak").effects[0]).toMatchObject({ id: "c2" });
  });

  it("jawaban gak jelas: TANYA LAGI, jangan bikin task", () => {
    const c = conv({ tasks });
    c.send("selesaiin makan");
    const r = c.send("hmm yang itu deh");
    expect(r.effects).toHaveLength(0);
    expect(textOf(r)).toContain("nomornya");
    expect(c.pending?.kind).toBe("choose");
  });

  it("kalau user ganti pikiran pakai perintah baru, dibiarin lewat", () => {
    const c = conv({ tasks });
    c.send("selesaiin makan");
    expect(textOf(c.send("tampilin task besok"))).not.toContain("nomornya");
  });

  it("nomor tetap cara paling langsung", () => {
    const c = conv({ tasks });
    c.send("selesaiin makan");
    expect(c.send("2").effects[0]).toMatchObject({ id: "c2" });
  });
});

describe("regresi — beberapa item dalam satu kalimat", () => {
  function dibuat(input: string) {
    return conv()
      .send(input)
      .effects.filter((e): e is Extract<Effect, { type: "CREATE_FROM_PARSE" }> =>
        e.type === "CREATE_FROM_PARSE",
      )
      .map((e) => ({
        judul: e.parsed.title,
        tgl: (e.parsed.startAt ?? e.parsed.dueAt)?.getDate(),
        jam: (e.parsed.startAt ?? e.parsed.dueAt)?.getHours(),
      }));
  }

  it("laporan asli: dua zoom dalam satu kalimat", () => {
    const r = dibuat(
      "tambahkan jadwal , zoom dismath di rabu 12 agustus , zoom calculus di 13 agustus di jam 13.20",
    );
    expect(r).toEqual([
      { judul: "Zoom dismath", tgl: 12, jam: 0 },
      { judul: "Zoom calculus", tgl: 13, jam: 13 },
    ]);
  });

  it("tanggal gak bocor ke judul walau disebut dua kali", () => {
    expect(dibuat("tambahin zoom dismath di rabu 12 agustus")[0]!.judul).toBe("Zoom dismath");
  });

  it("daftar sederhana", () => {
    expect(dibuat("tambahin beli kopi, beli susu, beli roti").map((x) => x.judul)).toEqual([
      "Beli kopi",
      "Beli susu",
      "Beli roti",
    ]);
  });

  it("potongan tanpa judul nempel ke item sebelumnya, bukan dibuang", () => {
    const r = dibuat("tambahin rapat tim, besok jam 3");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ judul: "Rapat tim", tgl: 8, jam: 15 });
  });

  it("koma desimal gak ikut kepecah", () => {
    const r = dibuat("tambahin olahraga 1,5 jam besok");
    expect(r).toHaveLength(1);
    expect(r[0]!.judul).toBe("Olahraga");
  });

  it("balasannya dirinci satu-satu, biar salah pecah langsung kelihatan", () => {
    const out = textOf(conv().send("tambahin beli kopi, beli susu"));
    expect(out).toContain("2 ditambahin");
    expect(out).toContain("Beli kopi");
    expect(out).toContain("Beli susu");
  });

  it("satu item tetap dijawab ringkas seperti biasa", () => {
    expect(textOf(conv().send("tambahin beli kopi besok"))).toContain('Oke — "Beli kopi"');
  });

  it("perintah MERUSAK tetap gak dipecah — separuh jalan pas hapus itu mahal", () => {
    const tasks = [
      task("a", "Beli kopi", { dueAt: iso(2026, 8, 8, 9, 0) }),
      task("b", "Beli susu", { dueAt: iso(2026, 8, 8, 10, 0) }),
    ];
    const r = conv({ tasks }).send("hapus beli kopi, beli susu");
    expect(r.effects).toHaveLength(0); // konfirmasi dulu, bukan langsung hapus dua-duanya
  });
});

describe("bantuan & fallback", () => {
  it("bantuan nampilin contoh yang bisa dipakai", () => {
    expect(textOf(conv().send("bisa ngapain aja?"))).toContain("tambahin task");
  });

  it("input kosong gak bikin apa-apa", () => {
    expect(conv().send("   ").messages).toHaveLength(0);
  });
});

describe("sapaan pembuka (§2)", () => {
  it("nyebut agenda berikutnya", () => {
    const blocks = [block("b1", "Rapat sama client", iso(2026, 8, 8, 15, 0), iso(2026, 8, 8, 16, 0))];
    const m = openingMessage({ now: NOW, tasks: [], blocks, userName: "Kai" });
    expect(m.text).toContain("Kai");
    expect(m.text).toContain("Rapat sama client");
  });

  it("gak ada jadwal tapi ada task", () => {
    const tasks = [task("t1", "Bikin laporan")];
    const m = openingMessage({ now: NOW, tasks, blocks: [], userName: "Kai" });
    expect(m.text).toContain("1 task");
  });

  it("kosong sama sekali", () => {
    const m = openingMessage({ now: NOW, tasks: [], blocks: [], userName: "Kai" });
    expect(m.text).toContain("kosong");
  });
});
