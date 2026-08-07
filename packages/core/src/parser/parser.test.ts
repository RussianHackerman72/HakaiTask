/**
 * Suite ini yang jadi patokan "kamusnya udah cukup atau belum" — PLAN.md §6.1.9
 * Acuan waktu: Jumat, 7 Agustus 2026, 10:00.
 */
import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./index.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0); // Jumat 7 Agu 2026

function p(input: string) {
  return parseQuickAdd(input, { now: NOW });
}

/** "2026-08-09 15:00" */
function at(d: Date | undefined): string {
  if (!d) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function day(d: Date | undefined): string {
  return at(d).slice(0, 10);
}

describe("dasar", () => {
  it("judul saja, tanpa tanggal", () => {
    const r = p("beli kopi");
    expect(r.title).toBe("Beli kopi");
    expect(r.dueAt).toBeUndefined();
    expect(r.kind).toBe("task");
  });

  it("besok jam 2 → 14:00, P1", () => {
    const r = p("revisi vlog besok jam 2 !p1");
    expect(r.title).toBe("Revisi vlog");
    expect(at(r.dueAt)).toBe("2026-08-08 14:00");
    expect(r.priority).toBe(1);
  });

  it("rentang jam mengisi startAt + estimasi", () => {
    const r = p("meeting senin jam 10-11 @kerja");
    expect(r.title).toBe("Meeting");
    expect(at(r.startAt)).toBe("2026-08-10 10:00");
    expect(at(r.endAt)).toBe("2026-08-10 11:00");
    expect(r.estimateMin).toBe(60);
    expect(r.project).toBe("kerja");
  });

  it("pengulangan tanpa dueAt", () => {
    const r = p("olahraga tiap senin rabu jumat");
    expect(r.title).toBe("Olahraga");
    expect(r.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(r.dueAt).toBeUndefined();
  });

  it("tanggal + !! = P1", () => {
    const r = p("bayar listrik tgl 25 !!");
    expect(r.title).toBe("Bayar listrik");
    expect(day(r.dueAt)).toBe("2026-08-25");
    expect(r.priority).toBe(1);
  });

  it("durasi desimal + energi", () => {
    const r = p("nulis draft 1.5j ~berat");
    expect(r.title).toBe("Nulis draft");
    expect(r.estimateMin).toBe(90);
    expect(r.energy).toBe("high");
  });

  it("jam 8 malam → 20:00 hari ini", () => {
    const r = p("kirim email jam 8 malam");
    expect(r.title).toBe("Kirim email");
    expect(at(r.dueAt)).toBe("2026-08-07 20:00");
  });
});

describe("kalimat gaul", () => {
  it("masukin jadwal gw tar lusa jam 3 an gw ada rapat", () => {
    const r = p("masukin jadwal gw tar lusa jam 3 an gw ada rapat");
    expect(r.kind).toBe("busy");
    expect(r.title).toBe("Rapat");
    expect(at(r.dueAt)).toBe("2026-08-09 15:00");
    expect(r.approxTime).toBe(true);
  });

  it("ingetin gw tgl 4 jam 1.20 gw ad zoom kelas", () => {
    const r = p("ingetin gw tgl 4 jam 1.20 gw ad zoom kelas");
    expect(r.kind).toBe("task");
    expect(r.title).toBe("Zoom kelas");
    expect(at(r.dueAt)).toBe("2026-09-04 13:20");
    expect(r.wantsReminder).toBe(true);
  });

  it("jgn lupa bsk pagi bales email klien ya", () => {
    const r = p("jgn lupa bsk pagi bales email klien ya");
    expect(r.title).toBe("Bales email klien");
    expect(at(r.dueAt)).toBe("2026-08-08 08:00");
    expect(r.wantsReminder).toBe(true);
  });

  it("gw mau ngopi bareng reo hari minggu sore", () => {
    const r = p("gw mau ngopi bareng reo hari minggu sore");
    expect(r.kind).toBe("busy");
    expect(r.title).toBe("Ngopi bareng reo");
    expect(at(r.dueAt)).toBe("2026-08-09 16:00");
  });

  it("tambahin dong revisi video yg kemaren bentar aja", () => {
    const r = p("tambahin dong revisi video yg kemaren bentar aja");
    expect(r.title).toBe("Revisi video");
    expect(r.estimateMin).toBe(15);
  });

  it("kudu bayar kosan sblm tgl 5", () => {
    const r = p("kudu bayar kosan sblm tgl 5");
    expect(r.title).toBe("Bayar kosan");
    expect(day(r.dueAt)).toBe("2026-09-05");
    expect(r.priority).toBe(2);
  });

  it("setengah 8 malem ada kelas online tiap selasa", () => {
    const r = p("setengah 8 malem ada kelas online tiap selasa");
    expect(r.title).toBe("Kelas online");
    expect(at(r.dueAt)).toBe("2026-08-07 19:30");
    expect(r.recurrence).toBe("FREQ=WEEKLY;BYDAY=TU");
  });

  it("catat aja: riset kompetitor, sekitar 2 jaman", () => {
    const r = p("catat aja: riset kompetitor, sekitar 2 jaman");
    expect(r.title).toBe("Riset kompetitor");
    expect(r.estimateMin).toBe(120);
    expect(r.approxTime).toBe(true);
  });
});

describe("jebakan", () => {
  it("tanggal di tengah kalimat tetap diparse tapi disorot", () => {
    const r = p("meeting soal deadline besok");
    expect(day(r.dueAt)).toBe("2026-08-08");
    expect(r.matched.some((m) => m.label === "besok" && m.role === "date")).toBe(true);
  });

  it("tanda kutip memaksa literal", () => {
    const r = p('"rapat besok" jam 2');
    expect(r.title).toBe("Rapat besok");
    expect(at(r.dueAt)).toBe("2026-08-07 14:00");
  });

  it('"ki" bukan partikel — pencocokan per kata utuh', () => {
    expect(p("beli kaos kaki").title).toBe("Beli kaos kaki");
  });

  it('"ke" cuma dibuang kalau menggantung di ujung', () => {
    expect(p("beli tiket ke bali").title).toBe("Beli tiket ke bali");
  });

  it("meridiem eksplisit menang atas aturan jendela kerja", () => {
    const r = p("jam 2 pagi berangkat");
    expect(at(r.dueAt)).toBe("2026-08-07 02:00");
  });

  it("'minggu depan' gak bentrok sama nama orang", () => {
    const r = p("minggu depan ketemu bu minggu");
    expect(day(r.dueAt)).toBe("2026-08-10");
    expect(r.title).toBe("Ketemu bu minggu");
  });
});

describe("modifier hari (bug: 'senin besok' dulu lompat 2 minggu)", () => {
  it("'senin besok' = Senin terdekat, BUKAN seminggu setelah Senin depan", () => {
    const r = p("meeting senin besok");
    // Jumat 7 Agu 2026 → Senin terdekat = 10 Agu, bukan 17 Agu
    expect(day(r.dueAt)).toBe("2026-08-10");
    expect(r.title).toBe("Meeting");
  });

  it("'senin nanti' juga cuma penekanan, tetap nearest", () => {
    expect(day(p("kelas senin nanti").dueAt)).toBe("2026-08-10");
  });

  it("bare 'senin' (tanpa modifier) = sama dengan 'senin besok'", () => {
    expect(day(p("meeting senin").dueAt)).toBe(day(p("meeting senin besok").dueAt));
  });

  it("'senin depan' SENGAJA beda — lompat ke minggu berikutnya", () => {
    const r = p("meeting senin depan");
    expect(day(r.dueAt)).toBe("2026-08-17");
  });

  it("'senin ini' = Senin minggu berjalan (delta dibiarkan apa adanya)", () => {
    const r = p("meeting senin ini");
    expect(day(r.dueAt)).toBe("2026-08-10");
  });
});

describe("kamus diperbanyak", () => {
  it("'ahad' (istilah agama) dikenali sebagai Minggu", () => {
    const r = p("acara ahad jam 10");
    expect(r.kind).toBe("busy");
    expect(day(r.dueAt)).toBe("2026-08-09");
    expect(at(r.dueAt)).toBe("2026-08-09 10:00");
  });

  it("'pekan depan' = sinonim 'minggu depan'", () => {
    const r = p("pekan depan ada rapat");
    expect(day(r.dueAt)).toBe("2026-08-10");
    expect(r.kind).toBe("busy");
    expect(r.title).toBe("Rapat");
  });

  it("'ahad depan' juga nyambung ke aturan 'minggu depan'", () => {
    const r = p("ahad depan liburan");
    expect(day(r.dueAt)).toBe("2026-08-10");
    expect(r.title).toBe("Liburan");
  });

  it("'dini hari' sebagai daypart baru", () => {
    const r = p("berangkat besok dini hari");
    expect(at(r.dueAt)).toBe("2026-08-08 02:00");
  });

  it("bug lama: kunci priorityWords berspasi sekarang beneran kepakai", () => {
    const utama = p("submit laporan prioritas utama");
    expect(utama.priority).toBe(1);
    expect(utama.title).toBe("Submit laporan");

    const rendah = p("balesin chat no rush");
    expect(rendah.priority).toBe(4);
    expect(rendah.title).toBe("Balesin chat");

    const gaPenting = p("beresin meja ga penting");
    expect(gaPenting.priority).toBe(4);
    expect(gaPenting.title).toBe("Beresin meja");
  });

  it("sinonim energi lewat sigil ~", () => {
    expect(p("nulis draft ~sulit").energy).toBe("high");
    expect(p("cuci piring ~mudah").energy).toBe("low");
  });

  it("typo bulan: 'febuari' dan ejaan lama 'nopember'", () => {
    const feb = p("bayar listrik tgl 5 febuari");
    expect(day(feb.dueAt)).toBe("2027-02-05"); // udah lewat tahun ini → lompat ke 2027

    const nov = p("acara tgl 20 nopember");
    expect(day(nov.dueAt)).toBe("2026-11-20");
    expect(nov.kind).toBe("busy");
  });
});

describe("kamus dari daftar user (typo, noise, sinonim)", () => {
  it("typo 'bkin' + kombinasi 'bikin reminder' menang atas bucket neutral default", () => {
    const r = p("bkin reminder rapat besok woy");
    expect(r.wantsReminder).toBe(true);
    expect(r.kind).toBe("task");
    expect(r.title).toBe("Rapat");
    expect(day(r.dueAt)).toBe("2026-08-08");
  });

  it("'set alarm' kepental ke bucket remind, bukan neutral (greedy-match 'set' sendirian)", () => {
    const r = p("set alarm besok jam 6 pagi");
    expect(r.wantsReminder).toBe(true);
    expect(r.kind).toBe("task");
    expect(at(r.dueAt)).toBe("2026-08-08 06:00");
  });

  it("typo 'mskin' + noise laughter/address-term ('bang','wkwk') dibuang bersih", () => {
    const r = p("mskin agenda meeting jam 2 bang wkwk");
    expect(r.kind).toBe("busy");
    expect(r.title).toBe("Meeting");
    expect(at(r.dueAt)).toBe("2026-08-07 14:00");
  });

  it("'mungkin' jadi sinyal perkiraan, sama kayak 'sekitar'", () => {
    const r = p("mungkin jam 3 nonton bareng");
    expect(r.approxTime).toBe(true);
    expect(at(r.dueAt)).toBe("2026-08-07 15:00");
    expect(r.kind).toBe("busy");
  });

  it("'tulisin' tetap KEPAKE di judul (beda dari 'catat' yang dibuang)", () => {
    const r = p("tulisin ide project baru");
    expect(r.title).toBe("Tulisin ide project baru");
    expect(r.kind).toBe("task");
    expect(r.dueAt).toBeUndefined();
  });

  it("'book' (sinonim Inggris) memicu kind busy sendirian", () => {
    const r = p("book meeting sama klien besok");
    expect(r.kind).toBe("busy");
    expect(r.title).toBe("Meeting sama klien");
    expect(day(r.dueAt)).toBe("2026-08-08");
  });
});

describe("token bertanda", () => {
  it("tag, subtask, catatan, reminder", () => {
    const r = p("revisi vlog besok jam 2 #konten #urgent *30m +cek audio // pakai b-roll");
    expect(r.tags).toEqual(["konten", "urgent"]);
    expect(r.reminderMin).toBe(30);
    expect(r.subtasks).toEqual(["cek audio"]);
    expect(r.notes).toBe("pakai b-roll");
    expect(r.title).toBe("Revisi vlog");
  });

  it("%sibuk memaksa jadi BusyBlock", () => {
    const r = p("standup tiap hari kerja jam 9-9.15 %sibuk");
    expect(r.kind).toBe("busy");
    expect(r.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(at(r.startAt)).toBe("2026-08-07 09:00");
    expect(at(r.endAt)).toBe("2026-08-07 09:15");
  });
});

describe("kandidat Ajarin (§6.1.7)", () => {
  it("kata mirip entri kamus dicatat sebagai near-miss", () => {
    const r = p("meeting besuknya sama klien");
    expect(r.unmatched.length).toBeGreaterThan(0);
  });
});
