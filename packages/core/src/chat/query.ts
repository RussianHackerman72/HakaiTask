/**
 * Penyaringan & pencarian — PLAN-CHAT.md §7
 *
 * Satu fungsi dipakai semua perintah LIST. Ini konsekuensi dari keputusan
 * "sedikit intent, banyak filter" (§3): "task hari ini" dan "task minggu
 * depan" bukan dua perintah berbeda — itu perintah yang sama dengan rentang
 * berbeda.
 */
import type { BusyBlock, Task } from "../types.js";
import chatLex from "./lexicon.chat.id.json" with { type: "json" };
import type { ObjectKind, StatusFilter } from "./intent.js";
import { inRange, upcomingRange, type DateRange } from "./range.js";
import { expandBlocks, type Occurrence } from "./recur.js";

const TOPICS = chatLex.topicGroups as Record<string, string[]>;

/** Maksimal hasil yang ditampilkan sekaligus (§7 langkah 8). */
export const RESULT_CAP = 10;

export interface QueryFilter {
  kind?: ObjectKind;
  range?: DateRange;
  status?: StatusFilter;
  topic?: string;
  keyword?: string;
  /**
   * Ikutkan task yang udah selesai walau status gak diminta.
   *
   * Menyembunyikan yang selesai itu aturan buat MENAMPILKAN daftar, bukan buat
   * MENCARI target. Tanpa ini, "selesaiin laporan" pada task yang udah selesai
   * bakal jawab "gak nemu" — padahal jawaban yang bener "udah selesai kok"
   * (E12).
   */
  includeDone?: boolean;
}

export interface QueryContext {
  now: Date;
  tasks: readonly Task[];
  blocks: readonly BusyBlock[];
}

export interface QueryResult {
  tasks: Task[];
  occurrences: Occurrence[];
  /** Jumlah sebelum dipotong `RESULT_CAP`. */
  total: number;
  capped: boolean;
}

// ── pencocokan teks ──────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cocok per kata, bukan potongan huruf — biar "call" gak kena "recall".
 * Dipakai buat grup topik, yang isinya kata benda utuh.
 */
function hasWord(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRe(needle)}\\b`).test(haystack);
}

function matchesTopic(title: string, topic: string): boolean {
  const syn = TOPICS[topic];
  if (!syn) return false;
  const t = title.toLowerCase();
  return syn.some((w) => hasWord(t, w));
}

/** Kata kunci sengaja lebih longgar dari topik: potongan huruf pun diterima. */
function matchesKeyword(task: { title: string; notes?: string }, kw: string): boolean {
  const needle = kw.toLowerCase();
  if (task.title.toLowerCase().includes(needle)) return true;
  return task.notes !== undefined && task.notes.toLowerCase().includes(needle);
}

// ── task ─────────────────────────────────────────────────────────────────────

/** Waktu efektif sebuah task buat penyaringan & pengurutan. */
export function taskTime(t: Task): string | undefined {
  return t.dueAt ?? t.startAt;
}

/**
 * Task yang "hidup". Sengaja disamain persis sama `useTasks()` di web —
 * kalau chat dan dashboard beda aturan buang, user bakal lihat dua cerita
 * berbeda soal data yang sama.
 */
export function livingTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => !t.deletedAt && t.status !== "archived");
}

function matchesStatus(t: Task, status: StatusFilter, now: Date): boolean {
  switch (status) {
    case "done":
      return t.status === "done";
    case "todo":
      return t.status !== "done";
    case "overdue": {
      if (t.status === "done") return false;
      const due = taskTime(t);
      return due !== undefined && new Date(due).getTime() < now.getTime();
    }
  }
}

// ── query ────────────────────────────────────────────────────────────────────

export function queryItems(ctx: QueryContext, f: QueryFilter): QueryResult {
  const wantTask = f.kind === "task" || f.kind === "any" || f.kind === undefined;
  const wantSchedule = f.kind === "schedule" || f.kind === "any" || f.kind === undefined;

  // Rentang default "ke depan" cuma buat jadwal. Task sengaja TIDAK dibatasi
  // waktu kalau user gak nyebut tanggal: "tampilin task gw" mestinya juga
  // nunjukin yang gak punya deadline sama sekali.
  const range = f.range;

  let tasks: Task[] = [];
  if (wantTask) {
    tasks = livingTasks(ctx.tasks).filter((t) => {
      if (range && !inRange(taskTime(t), range)) return false;
      if (f.status && !matchesStatus(t, f.status, ctx.now)) return false;
      if (f.topic && !matchesTopic(t.title, f.topic)) return false;
      if (f.keyword && !matchesKeyword(t, f.keyword)) return false;
      return true;
    });

    // Tanpa filter status eksplisit, yang udah selesai disembunyiin —
    // "tampilin task gw" artinya yang masih perlu dikerjain (keputusan P3).
    if (!f.status && !f.includeDone) tasks = tasks.filter((t) => t.status !== "done");
  }

  let occurrences: Occurrence[] = [];
  if (wantSchedule) {
    // Jadwal WAJIB lewat ekspansi: tanpa ini yang berulang gak pernah muncul
    // di hari berikutnya (T8).
    occurrences = expandBlocks(ctx.blocks, range ?? upcomingRange(ctx.now)).filter((o) => {
      if (f.topic && !matchesTopic(o.block.title, f.topic)) return false;
      if (f.keyword && !matchesKeyword({ title: o.block.title }, f.keyword)) return false;
      return true;
    });
  }

  tasks.sort(byTime);
  const total = tasks.length + occurrences.length;

  return {
    tasks: tasks.slice(0, RESULT_CAP),
    occurrences: occurrences.slice(0, Math.max(0, RESULT_CAP - Math.min(tasks.length, RESULT_CAP))),
    total,
    capped: total > RESULT_CAP,
  };
}

/** Yang gak punya waktu ditaruh paling belakang, bukan dianggap tahun 1970. */
function byTime(a: Task, b: Task): number {
  const ta = taskTime(a);
  const tb = taskTime(b);
  if (ta === undefined && tb === undefined) return a.title.localeCompare(b.title);
  if (ta === undefined) return 1;
  if (tb === undefined) return -1;
  return ta.localeCompare(tb);
}

// ── ketersediaan waktu (§13: cek titik masuk MVP) ────────────────────────────

/**
 * Apa yang nutup sebuah titik waktu. Kosong = user luang.
 *
 * Task **all-day** sengaja gak dianggap nutup jam (E4): "besok jam 3 kosong
 * ga?" mestinya gak dijawab "sibuk" cuma gara-gara ada task tanpa jam yang
 * jatuh tempo besok.
 */
export function busyAt(ctx: QueryContext, at: Date): Occurrence[] {
  const point: DateRange = {
    from: at,
    to: new Date(at.getTime() + 1),
    label: "saat itu",
  };
  return expandBlocks(ctx.blocks, point);
}
