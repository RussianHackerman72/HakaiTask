/**
 * Mesin prioritas — PLAN.md §4
 *
 * Menjawab satu pertanyaan: "apa yang harus gue kerjain sekarang?"
 * Ini bukan sekadar ORDER BY dueAt.
 */
import type { Energy, Priority, Task } from "./types.js";

export const WEIGHTS = {
  urgency: 3.0,
  priority: 2.0,
  aging: 1.0,
  started: 1.5,
  quickWin: 0.5,
  energy: 1.2,
  blocked: 5.0,
  snoozed: 99,
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Naik eksponensial mendekati deadline. Lewat deadline = maksimum. */
export function urgency(dueAt: string | undefined, now: Date): number {
  if (!dueAt) return 0.1;
  const diff = new Date(dueAt).getTime() - now.getTime();
  if (diff <= 0) return 1.0;
  if (diff < 2 * HOUR) return 0.95;
  if (isSameDay(new Date(dueAt), now)) return 0.8;
  if (diff < 2 * DAY) return 0.55;
  if (diff < 3 * DAY) return 0.35;
  if (diff < 7 * DAY) return 0.2;
  return 0.08;
}

const PRIORITY_WEIGHT: Record<Priority, number> = {
  1: 1.0,
  2: 0.65,
  3: 0.35,
  4: 0.15,
};

/** Task yang dihindari naik pelan-pelan — anti-procrastination tanpa nyinyir. */
export function agingBonus(createdAt: string, now: Date): number {
  const ageDays = (now.getTime() - new Date(createdAt).getTime()) / DAY;
  return Math.min(Math.max(ageDays, 0) / 30, 1.0);
}

/**
 * Energi MENGGESER urutan, bukan menyembunyikan task (§6.6).
 * Bobotnya 1.2 lawan urgency 3.0 — task P1 lewat deadline tetap nomor satu.
 */
export function energyMatch(taskEnergy: Energy | undefined, mode: Energy): number {
  if (!taskEnergy) return 0.4;
  if (taskEnergy === mode) return 1.0;
  const order: Energy[] = ["low", "medium", "high"];
  const gap = Math.abs(order.indexOf(taskEnergy) - order.indexOf(mode));
  return gap === 1 ? 0.4 : 0;
}

/** Mode energi otomatis dari jam + jumlah sesi fokus hari ini (§6.6). */
export function inferEnergyMode(now: Date, focusSessionsToday = 0): Energy {
  const h = now.getHours();
  let level: number;
  if (h >= 6 && h < 11) level = 2;
  else if (h >= 11 && h < 14) level = 1;
  else if (h >= 14 && h < 16) level = 0;
  else if (h >= 16 && h < 19) level = 1;
  else level = 0;
  if (focusSessionsToday > 3) level = Math.max(0, level - 1);
  return (["low", "medium", "high"] as const)[level]!;
}

export interface ScoreContext {
  now: Date;
  energyMode: Energy;
  /** id task yang sudah selesai — buat ngecek blockedBy */
  doneIds?: ReadonlySet<string>;
}

export interface ScoreBreakdown {
  total: number;
  urgency: number;
  priority: number;
  aging: number;
  started: number;
  quickWin: number;
  energy: number;
  blocked: number;
  snoozed: boolean;
}

export function scoreTask(task: Task, ctx: ScoreContext): ScoreBreakdown {
  const u = urgency(task.dueAt, ctx.now);
  const p = PRIORITY_WEIGHT[task.priority];
  const a = agingBonus(task.createdAt, ctx.now);
  const s = task.status === "doing" ? 1 : 0;
  const q = task.estimateMin !== undefined && task.estimateMin <= 15 ? 1 : 0;
  const e = energyMatch(task.energy, ctx.energyMode);

  const blocked =
    task.blockedBy?.some((id) => !ctx.doneIds?.has(id)) ?? false ? 1 : 0;

  const snoozed =
    task.snoozedUntil !== undefined &&
    new Date(task.snoozedUntil).getTime() > ctx.now.getTime();

  const total =
    WEIGHTS.urgency * u +
    WEIGHTS.priority * p +
    WEIGHTS.aging * a +
    WEIGHTS.started * s +
    WEIGHTS.quickWin * q +
    WEIGHTS.energy * e -
    WEIGHTS.blocked * blocked -
    (snoozed ? WEIGHTS.snoozed : 0);

  return {
    total,
    urgency: u,
    priority: p,
    aging: a,
    started: s,
    quickWin: q,
    energy: e,
    blocked,
    snoozed,
  };
}

export interface RankedTask {
  task: Task;
  score: ScoreBreakdown;
}

export function rankTasks(tasks: readonly Task[], ctx: ScoreContext): RankedTask[] {
  const doneIds =
    ctx.doneIds ??
    new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));

  return tasks
    .filter((t) => t.status === "todo" || t.status === "doing")
    .filter((t) => !t.deletedAt)
    .map((task) => ({ task, score: scoreTask(task, { ...ctx, doneIds }) }))
    .sort((a, b) => b.score.total - a.score.total);
}

export type FocusKind = "today" | "upcoming" | "empty";

export interface FocusSelection {
  kind: FocusKind;
  focus?: Task;
  upcoming: Task[];
}

/**
 * Pemilihan Focus Task — §4.2.
 * Kalau hari ini kosong, mundur ke task terjadwal terdekat di masa depan.
 */
export function selectFocus(
  tasks: readonly Task[],
  ctx: ScoreContext,
  upcomingCount = 5,
): FocusSelection {
  const ranked = rankTasks(tasks, ctx).filter((r) => !r.score.snoozed);

  if (ranked.length === 0) return { kind: "empty", upcoming: [] };

  const dueToday = ranked.filter(
    (r) =>
      r.task.dueAt !== undefined &&
      new Date(r.task.dueAt).getTime() <= endOfDay(ctx.now).getTime(),
  );

  if (dueToday.length > 0) {
    return {
      kind: "today",
      focus: dueToday[0]!.task,
      upcoming: ranked
        .filter((r) => r.task.id !== dueToday[0]!.task.id)
        .slice(0, upcomingCount)
        .map((r) => r.task),
    };
  }

  const scheduled = ranked
    .filter((r) => r.task.dueAt !== undefined || r.task.startAt !== undefined)
    .sort(
      (a, b) =>
        new Date(a.task.dueAt ?? a.task.startAt!).getTime() -
        new Date(b.task.dueAt ?? b.task.startAt!).getTime(),
    );

  if (scheduled.length > 0) {
    return {
      kind: "upcoming",
      focus: scheduled[0]!.task,
      upcoming: ranked
        .filter((r) => r.task.id !== scheduled[0]!.task.id)
        .slice(0, upcomingCount)
        .map((r) => r.task),
    };
  }

  return {
    kind: "today",
    focus: ranked[0]!.task,
    upcoming: ranked.slice(1, upcomingCount + 1).map((r) => r.task),
  };
}

// ── Sapaan (§4.3) ────────────────────────────────────────────────────────────

export type GreetingSlot = "pagi" | "siang" | "sore" | "malam";

export function greetingSlot(now: Date): GreetingSlot {
  const h = now.getHours();
  if (h >= 4 && h < 11) return "pagi";
  if (h >= 11 && h < 15) return "siang";
  if (h >= 15 && h < 18) return "sore";
  return "malam";
}

export interface Greeting {
  salam: string;
  baris2: string;
}

export function buildGreeting(
  name: string,
  selection: FocusSelection,
  now: Date,
): Greeting {
  const salam = `Selamat ${greetingSlot(now)}, ${name}.`;
  const baris2 =
    selection.kind === "today"
      ? "Tugas kamu hari ini adalah"
      : selection.kind === "upcoming"
        ? "Tugas mendatang untuk mu adalah"
        : "Hari ini kamu bebas.";
  return { salam, baris2 };
}

// ── util ─────────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
