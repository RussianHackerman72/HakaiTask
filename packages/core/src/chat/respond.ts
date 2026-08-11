/**
 * Template balasan — PLAN-CHAT.md §11
 *
 * Semua kalimat sistem ada di file ini, sebagai fungsi murni dari data.
 * **Gak ada teks yang dihasilkan model.** Itu bukan sekadar prinsip
 * arsitektur — itu yang bikin seluruh perilaku chat bisa dites.
 *
 * Nada (keputusan P8): pakai "kamu", pendek, tanpa emoji, dan SELALU
 * nyebut ulang apa yang dilakukan biar user bisa nangkep salah parse —
 * "Oke, Meeting Client besok 15:00", bukan "Tersimpan!".
 */
import type { Task } from "../types.js";
import type { Ref } from "./resolve.js";
import type { Occurrence } from "./recur.js";
import type { QueryResult } from "./query.js";
import { RESULT_CAP, taskTime } from "./query.js";

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function clockOf(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Sen 10:00" — ringkas, cukup buat daftar pilihan. */
export function shortWhen(iso: string | undefined, allDay = false): string {
  if (!iso) return "kapan aja";
  const d = new Date(iso);
  const day = `${HARI[d.getDay()]} ${d.getDate()} ${BULAN[d.getMonth()]}`;
  return allDay ? day : `${day} ${clockOf(iso)}`;
}

/** Satu baris daftar, dipakai buat task maupun jadwal. */
export function lineOf(ref: Ref): string {
  return ref.at ? `${shortWhen(ref.at)} — ${ref.title}` : ref.title;
}

export function numbered(refs: readonly Ref[]): string {
  return refs.map((r, i) => `${i + 1}. ${lineOf(r)}`).join("\n");
}

export function bulleted(refs: readonly Ref[]): string {
  return refs.map((r) => `• ${lineOf(r)}`).join("\n");
}

// ── daftar hasil ─────────────────────────────────────────────────────────────

export function taskLine(t: Task): string {
  const when = taskTime(t);
  const head = when ? `${shortWhen(when, t.allDay)} — ` : "";
  const done = t.status === "done" ? " ✓" : "";
  return `• ${head}${t.title}${done}`;
}

export function occurrenceLine(o: Occurrence): string {
  return `• ${shortWhen(o.startAt)} — ${o.block.title}`;
}

export function listResult(res: QueryResult, label: string, what: string): string {
  if (res.total === 0) return `Gak ada ${what}${label ? ` ${label}` : ""}.`;

  const lines = [
    ...res.tasks.map(taskLine),
    ...res.occurrences.map(occurrenceLine),
  ];

  const head =
    res.total === 1
      ? `Ada 1 ${what}${label ? ` ${label}` : ""}:`
      : `Ada ${res.total} ${what}${label ? ` ${label}` : ""}:`;

  const tail = res.capped ? `\n…dan ${res.total - RESULT_CAP} lagi. Persempit pakai tanggal atau kata kunci.` : "";
  return `${head}\n${lines.join("\n")}${tail}`;
}

// ── ambiguitas & konfirmasi ──────────────────────────────────────────────────

export function askWhich(refs: readonly Ref[], what: string): string {
  return `Ada ${refs.length} ${what} yang cocok. Yang mana?\n${numbered(refs)}`;
}

export function tooMany(count: number, what: string): string {
  return `Ada ${count} ${what} yang cocok, kebanyakan buat dipilih. Persempit pakai tanggal atau kata kunci ya.`;
}

export function notFound(what: string, hint?: string): string {
  const base = `Gak nemu ${what} yang cocok.`;
  return hint ? `${base} ${hint}` : `${base} Coba tanpa tanggal, atau pakai kata lain.`;
}

/**
 * Kosong DI JENIS YANG DIMINTA, tapi jenis satunya ada isinya.
 *
 * Ini yang bikin bingung: user lihat sesuatu di hari Senin, ngetik "hapus task
 * hari senin", lalu dijawab "gak nemu" — padahal yang dia lihat tadi memang
 * ada, cuma jadwal bukan task. Diam soal itu bikin app-nya kelihatan rusak.
 */
export function notFoundButOther(
  what: string,
  otherWhat: string,
  count: number,
  label: string,
): string {
  return `Gak ada ${what}${label ? ` ${label}` : ""}. ${otherKindHint(otherWhat, count, label)}`;
}

/**
 * Ditempel ke jawaban kosong mana pun, termasuk LIST.
 *
 * "tampilin jadwal hari rabu" dijawab "Gak ada jadwal Rabu" itu benar
 * secara harfiah, tapi nyesatin kalau di hari itu sebenarnya ada task.
 * User gak mikir dalam kategori "task vs jadwal" — dia cuma tau ada
 * sesuatu di Rabu.
 */
export function otherKindHint(otherWhat: string, count: number, label: string): string {
  return `Tapi ada ${count} ${otherWhat}${label ? ` ${label}` : ""} — maksudnya itu?`;
}

export function confirmDelete(refs: readonly Ref[]): string {
  if (refs.length === 1) {
    return `Hapus "${refs[0]!.title}"${refs[0]!.at ? ` (${shortWhen(refs[0]!.at)})` : ""}? (ya / batal)`;
  }
  return `Bakal kehapus ${refs.length} item:\n${bulleted(refs)}\nYakin? (ya / batal)`;
}

export function deleted(refs: readonly Ref[]): string {
  const n = refs.length;
  const what = n === 1 ? `"${refs[0]!.title}"` : `${n} item`;
  return `${what} dihapus. Ketik "batal" kalau salah.`;
}

export function restored(refs: readonly Ref[]): string {
  return refs.length === 1
    ? `Dibalikin. "${refs[0]!.title}" muncul lagi.`
    : `Dibalikin. ${refs.length} item muncul lagi.`;
}

// ── aksi ─────────────────────────────────────────────────────────────────────

export function completed(title: string): string {
  return `"${title}" ditandai selesai.`;
}

export function alreadyDone(title: string): string {
  return `"${title}" udah selesai dari sebelumnya, kok.`;
}

export function uncompleted(title: string): string {
  return `"${title}" dibalikin jadi belum selesai.`;
}

export function rescheduled(title: string, iso: string): string {
  return `"${title}" dipindah ke ${shortWhen(iso)}.`;
}

export function askNewTime(title: string): string {
  return `"${title}" mau dipindah ke kapan?`;
}

export function created(title: string, iso: string | undefined, allDay: boolean): string {
  if (!title) return "Mau nambahin apa? Kasih judulnya ya.";
  return iso ? `Oke — "${title}", ${shortWhen(iso, allDay)}.` : `Oke — "${title}".`;
}

export function askTitle(): string {
  return "Mau nambahin apa? Kasih judulnya ya.";
}

/**
 * Beberapa item sekaligus dari satu kalimat.
 *
 * Hasilnya SELALU dirinci satu-satu, bukan cuma "3 ditambahin". Pemecahan
 * kalimat itu tebakan struktur — user harus bisa langsung lihat apakah
 * pecahannya sesuai maksudnya, dan mana yang tanggalnya meleset.
 */
export function createdMany(
  items: readonly { title: string; at?: string; allDay: boolean }[],
): string {
  const baris = items.map(
    (i) => `• ${i.at ? `${shortWhen(i.at, i.allDay)} — ` : ""}${i.title}`,
  );
  return `Oke, ${items.length} ditambahin:\n${baris.join("\n")}`;
}

/**
 * Basa-basi dijawab pendek dan berhenti di situ.
 *
 * Sengaja gak ngajak ngobrol lanjut ("ada lagi yang bisa dibantu?"): chat ini
 * alat, bukan asisten (§1). Yang penting cuma satu — kalimat sopan gak boleh
 * ninggalin jejak apa pun di data.
 */
export function chitchat(thanks: boolean): string {
  return thanks ? "Sama-sama." : "Sip.";
}

/** Kelihatan kayak judul, tapi gak ada aba-aba bikin. Tanya dulu. */
export function askConfirmCreate(title: string): string {
  return `Mau gue simpen "${title}" jadi task? (ya / batal)`;
}

// ── ketersediaan ─────────────────────────────────────────────────────────────

export function freeAt(label: string): string {
  return `${cap(label)} kamu kosong, gak ada agenda di waktu itu.`;
}

export function busyWith(label: string, occ: readonly Occurrence[]): string {
  const names = occ.map((o) => `"${o.block.title}"`).join(", ");
  return `${cap(label)} kamu ada ${names}.`;
}

// ── kamus pribadi ────────────────────────────────────────────────────────────

export function vocabList(entries: readonly { phrase: string; meaning: string }[]): string {
  if (entries.length === 0) {
    return 'Kamus kamu masih kosong. Ajarin gue istilah kamu, misalnya: kalau gw bilang clientan, maksudnya meeting client.';
  }
  const width = Math.max(...entries.map((e) => e.phrase.length));
  const lines = entries.map((e) => `  ${e.phrase.padEnd(width)} → ${e.meaning}`);
  return `Kamus kamu (${entries.length}):\n${lines.join("\n")}`;
}

export function vocabSaved(phrase: string, meaning: string): string {
  return `Sip. Mulai sekarang "${phrase}" = ${meaning}.`;
}

export function vocabDeleted(phrase: string): string {
  return `"${phrase}" dihapus dari kamus kamu.`;
}

export function askTeachPhrase(): string {
  return "Boleh. Kata atau istilahnya apa?";
}

export function askTeachMeaning(phrase: string): string {
  return `Oke. Kalau kamu bilang "${phrase}", artinya apa?`;
}

/**
 * Konfirmasi kamus WAJIB bawa tiga hal: pemetaannya, contoh terhitung, dan
 * peringatan kalau ada (§12). Baris contoh itu yang paling berharga — user
 * lihat akibat nyatanya sebelum nyimpan, bukan nemuin kejutan tiga hari lagi.
 */
export function confirmTeach(
  phrase: string,
  meaning: string,
  warnings: readonly { message: string }[],
  existing?: { meaning: string },
): string {
  const parts = [`Simpan ini?\n\n  ${phrase}  →  ${meaning}`];
  if (existing) parts.push(`\nSebelumnya: ${phrase} → ${existing.meaning}`);
  for (const w of warnings) parts.push(`\n${w.message}`);
  parts.push("\n(ya / batal)");
  return parts.join("\n");
}

export function teachCancelled(): string {
  return "Oke, gak jadi.";
}

/** Tawaran ngajarin — cuma muncul pas hasil nol & bukan perintah bikin (§11.1). */
export function offerTeach(term: string, label: string): string {
  return `Gue belum ngerti "${term}", jadi belum nemu apa-apa${label ? ` ${label}` : ""}. Mau kasih tau artinya?`;
}

// ── sapaan & bantuan ─────────────────────────────────────────────────────────

export function greeting(slot: string, name: string, next: Ref | null, taskCount: number): string {
  const salam = `Selamat ${slot}, ${name}.`;
  if (next) {
    return `${salam} Agenda kamu berikutnya ${shortWhen(next.at)}: ${next.title}. Ada yang bisa dibantu?`;
  }
  if (taskCount > 0) {
    return `${salam} Gak ada jadwal terdekat, tapi ada ${taskCount} task nunggu. Ada yang bisa dibantu?`;
  }
  return `${salam} Hari ini kosong. Mau nambahin sesuatu?`;
}

export const HELP_EXAMPLES = [
  "tambahin task bikin laporan besok jam 9",
  "jadwalin meeting sama client besok jam 3",
  "apa aja task gw hari ini?",
  "tampilin task yang belum selesai",
  "selesaiin task laporan",
  "besok jam 3 gw kosong ga?",
] as const;

export function help(): string {
  return [
    "Gue bisa bantu soal task sama jadwal. Contohnya:",
    ...HELP_EXAMPLES.map((e) => `  • ${e}`),
    "",
    'Kamu juga bisa ngajarin istilah sendiri: kalau gw bilang clientan, maksudnya meeting client.',
  ].join("\n");
}

export function unknown(): string {
  return 'Maaf, gue belum bisa itu. Gue bisa bantu soal task sama jadwal — ketik "bisa apa aja" buat lihat daftarnya.';
}

export function askObject(): string {
  return "Mau lihat task atau jadwal?";
}

export function gone(): string {
  return "Itemnya keburu ilang — mungkin udah dihapus dari device lain.";
}

export function provenance(applied: readonly { phrase: string; meaning: string }[]): string | null {
  if (applied.length === 0) return null;
  const parts = applied.map((a) => `${a.phrase} → ${a.meaning}`);
  return `(dari kamus kamu: ${parts.join(", ")})`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
