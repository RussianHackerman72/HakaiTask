/**
 * Suite Tahap 1 — PLAN-CHAT.md §21.
 *
 * Empat kasus di blok "racun kamus lama" itu bukan tes karangan: itu bukti
 * nyata bahwa `parseQuickAdd` sendirian gak bisa dipakai buat chat (T2–T4).
 * Kalau blok itu pecah, artinya lapisan verba udah bocor lagi.
 *
 * Acuan waktu disamain sama parser.test.ts: Jumat, 7 Agustus 2026, 10:00.
 */
import { describe, expect, it } from "vitest";
import { analyze, inferKind, isQuestion } from "./intent.js";
import { resolveDateRange, upcomingRange } from "./range.js";
import { words } from "./match.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0); // Jumat 7 Agu 2026

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function at(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-08-08 00:00 → 2026-08-09 00:00" */
function span(input: string): string {
  const r = resolveDateRange(input, NOW);
  return r ? `${at(r.from)} → ${at(r.to)}` : "-";
}

function label(input: string): string {
  return resolveDateRange(input, NOW)?.label ?? "-";
}

describe("rentang — relatif", () => {
  it("hari ini", () => {
    expect(span("hari ini")).toBe("2026-08-07 00:00 → 2026-08-08 00:00");
  });

  it("besok", () => {
    expect(span("besok")).toBe("2026-08-08 00:00 → 2026-08-09 00:00");
  });

  it("lusa", () => {
    expect(span("lusa")).toBe("2026-08-09 00:00 → 2026-08-10 00:00");
  });

  it("kemarin — kata yang dibuang parser lama (T2) tapi sah buat query", () => {
    expect(span("kemarin")).toBe("2026-08-06 00:00 → 2026-08-07 00:00");
  });

  it("rentangnya setengah terbuka: tepat satu hari", () => {
    const r = resolveDateRange("besok", NOW)!;
    expect(r.to.getTime() - r.from.getTime()).toBe(86_400_000);
  });
});

describe("rentang — minggu & bulan (minggu mulai Senin, keputusan P2)", () => {
  it("minggu ini = Senin s/d Senin berikutnya", () => {
    expect(span("minggu ini")).toBe("2026-08-03 00:00 → 2026-08-10 00:00");
  });

  it("minggu depan", () => {
    expect(span("minggu depan")).toBe("2026-08-10 00:00 → 2026-08-17 00:00");
  });

  it("minggu lalu", () => {
    expect(span("minggu lalu")).toBe("2026-07-27 00:00 → 2026-08-03 00:00");
  });

  it("bulan ini", () => {
    expect(span("bulan ini")).toBe("2026-08-01 00:00 → 2026-09-01 00:00");
  });

  it("bulan depan", () => {
    expect(span("bulan depan")).toBe("2026-09-01 00:00 → 2026-10-01 00:00");
  });
});

describe("rentang — nama hari vs kata 'minggu'", () => {
  it("senin = Senin terdekat ke depan", () => {
    expect(span("senin")).toBe("2026-08-10 00:00 → 2026-08-11 00:00");
  });

  it("senin depan = lompat sepekan lagi, beda dari 'senin'", () => {
    expect(span("senin depan")).toBe("2026-08-17 00:00 → 2026-08-18 00:00");
  });

  it("senin lalu", () => {
    expect(span("senin lalu")).toBe("2026-08-03 00:00 → 2026-08-04 00:00");
  });

  it("'minggu' sendirian = hari Minggu, bukan sepekan", () => {
    expect(span("minggu")).toBe("2026-08-09 00:00 → 2026-08-10 00:00");
  });

  it("'hari minggu' juga hari Minggu", () => {
    expect(span("hari minggu")).toBe("2026-08-09 00:00 → 2026-08-10 00:00");
  });

  it("tapi 'minggu ini' tetap sepekan — pengubah yang nentuin", () => {
    expect(span("minggu ini")).toBe("2026-08-03 00:00 → 2026-08-10 00:00");
  });
});

describe("rentang — tanggal", () => {
  it("25 des", () => {
    expect(span("25 des")).toBe("2026-12-25 00:00 → 2026-12-26 00:00");
  });

  it("tanggal 25 — tanggal yang belum lewat, bulan berjalan", () => {
    expect(span("tanggal 25")).toBe("2026-08-25 00:00 → 2026-08-26 00:00");
  });
});

describe("rentang — daypart mempersempit", () => {
  it("besok pagi", () => {
    expect(span("besok pagi")).toBe("2026-08-08 05:00 → 2026-08-08 11:00");
  });

  it("besok sore", () => {
    expect(span("besok sore")).toBe("2026-08-08 15:00 → 2026-08-08 18:00");
  });

  it("malam nutup di tengah malam, gak bocor ke hari berikutnya", () => {
    expect(span("besok malam")).toBe("2026-08-08 18:00 → 2026-08-09 00:00");
  });

  it("daypart sendirian = hari ini", () => {
    expect(span("pagi")).toBe("2026-08-07 05:00 → 2026-08-07 11:00");
  });

  it("rentang banyak hari TIDAK dipersempit daypart", () => {
    expect(span("minggu ini pagi")).toBe("2026-08-03 00:00 → 2026-08-10 00:00");
  });

  it("label ikut nyebut dayparnya", () => {
    expect(label("besok pagi")).toBe("besok pagi");
  });
});

describe("rentang — bukan tanggal", () => {
  it("kalimat tanpa tanggal balikin null", () => {
    expect(resolveDateRange("tampilin task laporan", NOW)).toBeNull();
  });

  it("upcomingRange dipakai sebagai default 'ke depan'", () => {
    const r = upcomingRange(NOW);
    expect(r.from.getTime()).toBe(NOW.getTime());
    expect(r.to.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("racun kamus lama — empat kasus yang bikin lapisan verba wajib ada", () => {
  it("T4 — 'hapus task laporan' jadi perintah hapus, BUKAN task berjudul 'Hapus…'", () => {
    const a = analyze("hapus task laporan", NOW);
    expect(a.verb).toBe("delete");
    expect(a.kind).toBe("task");
    expect(a.keyword).toBe("laporan");
  });

  it("T2 — 'belum selesai' kebaca status, padahal kata itu ada di daftar drop", () => {
    const a = analyze("tampilin task yang belum selesai", NOW);
    expect(a.verb).toBe("list");
    expect(a.kind).toBe("task");
    expect(a.status).toBe("todo");
  });

  it("T2 — lawannya juga: 'udah selesai' kebaca done", () => {
    expect(analyze("tampilin task yang udah selesai", NOW).status).toBe("done");
  });

  it("T3 — 'jadwal' jadi OBJEK, bukan perintah bikin jadwal", () => {
    const a = analyze("jadwal gw hari ini apa?", NOW);
    expect(a.verb).toBe("list");
    expect(a.kind).toBe("schedule");
    expect(a.range?.label).toBe("hari ini");
  });

  it("T2 — 'kemarin' gak ilang di jalur query", () => {
    const a = analyze("tampilin task kemarin", NOW);
    expect(a.verb).toBe("list");
    expect(a.range?.label).toBe("kemarin");
  });
});

describe("analisis — verba", () => {
  it("selesaiin", () => {
    const a = analyze("selesaiin task laporan", NOW);
    expect(a.verb).toBe("complete");
    expect(a.keyword).toBe("laporan");
  });

  it("pindahin + dua acuan waktu (penyaring & tujuan)", () => {
    const a = analyze("pindahin rapat senin ke selasa", NOW);
    expect(a.verb).toBe("reschedule");
    expect(a.topic).toBe("rapat");
  });

  it("'batalin selesai' menang atas 'batalin' — frasa terpanjang", () => {
    expect(analyze("batalin selesai laporan", NOW).verb).toBe("uncomplete");
  });

  it("ketersediaan", () => {
    const a = analyze("besok jam 3 gw kosong ga?", NOW);
    expect(a.verb).toBe("availability");
    expect(a.range?.label).toBe("besok");
  });

  it("bantuan", () => {
    expect(analyze("bisa ngapain aja?", NOW).verb).toBe("help");
  });

  it("ngajarin", () => {
    expect(analyze("gw mau ngajarin lu sesuatu", NOW).verb).toBe("teach");
  });
});

describe("analisis — penyaring", () => {
  it("grup topik kena, dan katanya TETAP jadi kata kunci", () => {
    const a = analyze("tampilin semua rapat gw", NOW);
    expect(a.verb).toBe("list");
    expect(a.topic).toBe("rapat");
    expect(a.bulk).toBe(true);
    expect(a.keyword).toBe("rapat");
    expect(a.kind).toBe("schedule");
  });

  it("topik multi-kata: 'urusan kampus' → kuliah", () => {
    expect(analyze("tampilin semua jadwal kuliah gw", NOW).topic).toBe("kuliah");
  });

  it("telat = overdue", () => {
    expect(analyze("tampilin task yang telat", NOW).status).toBe("overdue");
  });

  it("massal nyalain bendera konfirmasi", () => {
    const a = analyze("hapus semua meeting minggu ini", NOW);
    expect(a.verb).toBe("delete");
    expect(a.bulk).toBe(true);
    expect(a.range?.label).toBe("minggu ini");
  });
});

describe("analisis — kalimat tanya tanpa verba", () => {
  it("'apa aja tugas gw hari ini?' kebaca list", () => {
    const a = analyze("apa aja tugas gw hari ini?", NOW);
    expect(a.verb).toBe("list");
    expect(a.kind).toBe("task");
    expect(a.range?.label).toBe("hari ini");
  });

  it("'gak?' di ujung kalimat = penanda tanya", () => {
    expect(isQuestion(words("besok ada meeting gak?"))).toBe(true);
  });

  it("kata asing di kalimat tanya tersisa buat ditawarin diajarin (§11)", () => {
    const a = analyze("besok gw ada clientan gak?", NOW);
    expect(a.verb).toBe("list");
    expect(a.range?.label).toBe("besok");
    expect(a.leftover).toContain("clientan");
  });
});

describe("analisis — jatuh ke CREATE", () => {
  it("tanpa verba perintah & ada bahan judul → create", () => {
    const a = analyze("tambahin task bikin laporan besok", NOW);
    expect(a.verb).toBe("create");
  });

  it("E16 — cuma nulis waktu doang → LIST, jangan bikin task kosong", () => {
    expect(analyze("besok", NOW).verb).toBe("list");
  });

  it("kata asing di kalimat CREATE TIDAK bikin tawaran ajarin", () => {
    // "clientan" di sini judul yang sah, bukan istilah yang gagal dipahami
    expect(analyze("tambahin task clientan besok", NOW).verb).toBe("create");
  });
});

describe("analisis — objek kamus pribadi", () => {
  it("lihat kamus", () => {
    const a = analyze("tampilin vocabulary gw", NOW);
    expect(a.verb).toBe("list");
    expect(a.kind).toBe("vocab");
  });

  it("hapus satu entri — nol verba baru, cuma verba lama + objek", () => {
    const a = analyze("hapus vocabulary clientan", NOW);
    expect(a.verb).toBe("delete");
    expect(a.kind).toBe("vocab");
    expect(a.keyword).toBe("clientan");
  });

  it("'kamus gw' tanpa verba tetap kebaca list", () => {
    expect(analyze("kamus gw", NOW).verb).toBe("list");
  });
});

describe("tebakan jenis dari kata benda", () => {
  it("kata benda jadwal", () => {
    expect(inferKind(words("ada rapat besok"))).toBe("schedule");
  });

  it("netral kalau gak ada petunjuk", () => {
    expect(inferKind(words("besok pagi"))).toBe("any");
  });
});
