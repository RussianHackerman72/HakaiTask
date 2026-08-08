/**
 * Deteksi verba, objek, dan penyaring — PLAN-CHAT.md §3, §5.2 tahap ②–⑥
 *
 * Lapisan ini yang bikin chat mungkin. Parser lama (`parseQuickAdd`) sepenuhnya
 * berorientasi **penciptaan** — dia gak punya konsep "perintah", jadi kalau
 * "hapus task laporan" dikasih langsung ke sana, hasilnya task baru berjudul
 * "Hapus task laporan". Modul ini jalan **sebelum** parser lama dan mengenali
 * kata kerjanya duluan.
 *
 * Dua racun dari kamus lama yang ditangkal di sini (PLAN-CHAT T2–T4):
 *   • `belum`/`udah`/`sudah` ada di daftar `drop` → status dibaca DULUAN,
 *     sebelum apa pun sempat membuangnya.
 *   • `jadwal` ada di `intent.schedule` (= perintah bikin jadwal) → di sini dia
 *     diperlakukan sebagai OBJEK, jadi "jadwal gw hari ini apa?" kebaca query.
 */
import chatLex from "./lexicon.chat.id.json" with { type: "json" };
import lex from "../parser/lexicon.id.json" with { type: "json" };
import { findLongest, findLongestIn, words } from "./match.js";
import { findRange, type DateRange } from "./range.js";

export type Verb =
  | "create"
  | "list"
  | "complete"
  | "uncomplete"
  | "reschedule"
  | "delete"
  | "availability"
  | "help"
  | "teach"
  | "unknown";

export type ObjectKind = "task" | "schedule" | "vocab" | "any";
export type StatusFilter = "todo" | "done" | "overdue";

const VERBS = chatLex.verbs as Record<Exclude<Verb, "create" | "unknown" | "any">, string[]>;
const OBJECTS = chatLex.objects as Record<ObjectKind, string[]>;
const STATUS = chatLex.statusWords as Record<StatusFilter, string[]>;
const TOPICS = chatLex.topicGroups as Record<string, string[]>;
const QUESTION = chatLex.questionWords as string[];
const BULK = chatLex.bulkWords as string[];
const NOUN_SCHEDULE = lex.nounSchedule as string[];
const NOUN_TASK = lex.nounTask as string[];

/**
 * Kata sisa yang gak layak jadi kata kunci pencarian.
 *
 * Aman meminjam `drop`/`filler` kamus lama DI SINI — bahayanya (T2) cuma
 * berlaku kalau pembuangan terjadi sebelum status dibaca. Di titik ini status
 * sudah dikonsumsi duluan, jadi `belum`/`udah` yang tersisa memang benar-benar
 * partikel. Kata tanya ditambahkan manual karena kamus lama gak mengenalnya.
 */
const NOISE = new Set([
  ...(lex.drop as string[]),
  ...(lex.filler as string[]),
  ...(lex.dropIfTrailing as string[]),
  "ini",
  "itu",
  "sih",
  "dong",
  "ya",
  "ada",
  // "hari" nyangkut jadi kata kunci pas frasanya gak keparsing utuh ("di hari
  // itu"), dan sebagai kata kunci dia nyaring habis semua hasil.
  "hari",
  "tanggal",
  "tsb",
  "tersebut",
  "gak",
  "ga",
  "engga",
  "enggak",
  "nggak",
  "punya",
]);

export interface ChatAnalysis {
  verb: Verb;
  kind: ObjectKind;
  range?: DateRange;
  status?: StatusFilter;
  topic?: string;
  /** Dipicu kata "semua" — nentuin apakah operasi butuh konfirmasi (§9). */
  bulk: boolean;
  /** Sisa kata setelah semua yang dikenali dikonsumsi (§4a). */
  keyword: string;
  question: boolean;
  /** Kata yang gak kekonsumsi siapa pun — bahan tawaran "ajarin" (§11). */
  leftover: string[];
}

// ── pembacaan satuan ─────────────────────────────────────────────────────────

export function readVerb(ws: readonly string[], i: number): { verb: Verb; len: number } | null {
  const hit = findLongestIn(ws, i, VERBS);
  return hit ? { verb: hit.key as Verb, len: hit.len } : null;
}

export function readObject(
  ws: readonly string[],
  i: number,
): { kind: ObjectKind; len: number } | null {
  const hit = findLongestIn(ws, i, OBJECTS);
  return hit ? { kind: hit.key, len: hit.len } : null;
}

/**
 * Tebakan jenis dari kata benda isi kalimat — TIDAK mengonsumsi token, karena
 * kata itu justru kata kunci pencariannya. "tampilin semua rapat gw": `rapat`
 * nunjukin ini soal jadwal, sekaligus jadi kata yang dicari.
 */
export function inferKind(ws: readonly string[]): ObjectKind {
  for (const w of ws) {
    if (NOUN_SCHEDULE.includes(w)) return "schedule";
    if (NOUN_TASK.includes(w)) return "task";
  }
  return "any";
}

/** Penanda tanya, termasuk "gak?" di ujung kalimat — khas Indonesia. */
export function isQuestion(ws: readonly string[]): boolean {
  const tail = ws[ws.length - 1];
  if (tail === "gak" || tail === "ga" || tail === "engga" || tail === "enggak" || tail === "nggak") {
    return true;
  }
  for (let i = 0; i < ws.length; i++) {
    if (findLongest(ws, i, QUESTION)) return true;
  }
  return false;
}

// ── analisis kalimat ─────────────────────────────────────────────────────────

/**
 * Bongkar satu kalimat jadi bagian-bagiannya. Belum mengeksekusi apa pun —
 * `chatTurn()` (Tahap 2) yang nanti mengubah ini jadi efek + balasan.
 */
export function analyze(input: string, now: Date): ChatAnalysis {
  return analyzeWords(words(input), now);
}

/**
 * Versi yang nerima kata jadi. Dipakai `chatTurn()` supaya kamus pribadi
 * sempat diekspansi dulu sebelum dianalisis (PLAN-VOCAB §5.2 tahap ③).
 */
export function analyzeWords(ws: readonly string[], now: Date): ChatAnalysis {
  const used = new Array<boolean>(ws.length).fill(false);

  const take = (at: number, len: number): void => {
    for (let k = at; k < at + len && k < ws.length; k++) used[k] = true;
  };
  const free = (): string[] => ws.filter((_, i) => !used[i]);

  // ② verba — paling dulu, biar "hapus"/"tampilin" gak jatuh ke judul
  let verb: Verb | null = null;
  for (let i = 0; i < ws.length && verb === null; i++) {
    const hit = readVerb(ws, i);
    if (hit) {
      verb = hit.verb;
      take(i, hit.len);
    }
  }

  // ③ objek eksplisit
  let kind: ObjectKind = "any";
  for (let i = 0; i < ws.length; i++) {
    if (used[i]) continue;
    const hit = readObject(ws, i);
    if (hit) {
      kind = hit.kind;
      take(i, hit.len);
      break;
    }
  }

  // ④ status — WAJIB sebelum apa pun yang membuang kata, karena `belum`,
  //    `udah`, dan `sudah` semuanya ada di daftar `drop` kamus lama (T2)
  let status: StatusFilter | undefined;
  for (let i = 0; i < ws.length; i++) {
    if (used[i]) continue;
    const hit = findLongestIn(ws, i, STATUS);
    if (hit) {
      status = hit.key;
      take(i, hit.len);
      break;
    }
  }

  // ⑤ grup topik — token TIDAK dikonsumsi: dia juga kata kunci pencarian
  let topic: string | undefined;
  for (let i = 0; i < ws.length && topic === undefined; i++) {
    if (used[i]) continue;
    const hit = findLongestIn(ws, i, TOPICS);
    if (hit) topic = hit.key;
  }

  // massal
  let bulk = false;
  for (let i = 0; i < ws.length; i++) {
    if (used[i]) continue;
    const hit = findLongest(ws, i, BULK);
    if (hit) {
      bulk = true;
      take(i, hit.len);
      break;
    }
  }

  // ⑦ rentang tanggal
  const found = findRange(ws, now);
  let range: DateRange | undefined;
  if (found && !used[found.at]) {
    range = found.range;
    take(found.at, found.len);
  }

  const question = isQuestion(ws);

  // Kata sisa: buang partikel & kata bantu, sisanya jadi kata kunci
  const leftover = free().filter((w) => !NOISE.has(w) && !QUESTION.includes(w));
  const keyword = leftover.join(" ");

  return {
    verb: verb ?? fallbackVerb({ kind, question, leftover }),
    kind: kind === "any" ? inferKind(ws) : kind,
    ...(range ? { range } : {}),
    ...(status ? { status } : {}),
    ...(topic ? { topic } : {}),
    bulk,
    keyword,
    question,
    leftover,
  };
}

/**
 * Kalau gak ada verba sama sekali. Aturan aman §1.3: **kalau ragu, pilih baca.**
 * Salah-baca cuma bikin daftar yang gak kepake; salah-tulis bikin data kotor
 * yang harus dibersihin user.
 */
function fallbackVerb(ctx: {
  kind: ObjectKind;
  question: boolean;
  leftover: string[];
}): Verb {
  if (ctx.question) return "list";
  if (ctx.kind === "vocab") return "list";
  // Cuma nulis waktu doang ("besok") — gak ada bahan buat judul, jadi ini
  // pertanyaan, bukan perintah bikin (E16)
  if (ctx.leftover.length === 0) return "list";
  return "create";
}
