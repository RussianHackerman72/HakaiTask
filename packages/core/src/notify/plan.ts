/**
 * Kebijakan notifikasi — PLAN.md §6.7
 *
 * Dilanggar sekali, notifikasi bakal dimatiin selamanya sama user. Jadi
 * aturannya ditaruh di sini, sebagai fungsi MURNI yang bisa diuji tanpa
 * mocking sama sekali — bukan disebar jadi if-if di lapisan Android.
 *
 * Lapisan app tinggal jadi tukang rekonsiliasi: minta rencana, bandingin sama
 * yang udah terjadwal lewat `key`, batalin yang hilang, jadwalin yang baru.
 * Karena `key`-nya stabil dan idempoten, ngejalanin ini sepuluh kali berturut
 * hasilnya sama persis kayak sekali.
 */
import type { ISODate, Task, UserSettings } from "../types.js";

export type NotifKind = "due" | "brief" | "overdue" | "review" | "summary";

export interface PlannedNotification {
  /** Stabil & idempoten: "due:<taskId>", "brief:2026-09-05". */
  key: string;
  kind: NotifKind;
  at: ISODate;
  title: string;
  body: string;
  /** Tiap notif nunjuk ke SESUATU — §6.7 aturan 3, gak ada yang mendarat di halaman depan. */
  data: { taskId?: string };
}

const MIN = 60_000;
const DAY = 86_400_000;

function hhmm(s: string | undefined, fallback: [number, number]): [number, number] {
  const m = s?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return [Number(m[1]), Number(m[2])];
}

function atTime(day: Date, [h, m]: [number, number]): Date {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Jam tenang 22:00–06:00 (§6.7 aturan 2) — rentangnya NGELEWATIN tengah malam,
 * jadi perbandingannya OR, bukan AND. Ditulis kebalik, jam 23:00 lolos dan
 * jam 12 siang malah diblokir.
 */
export function inQuietHours(d: Date, quiet: readonly [string, string]): boolean {
  const [sh, sm] = hhmm(quiet[0], [22, 0]);
  const [eh, em] = hhmm(quiet[1], [6, 0]);
  const mins = d.getHours() * 60 + d.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start > end ? mins >= start || mins < end : mins >= start && mins < end;
}

/** Ujung jam tenang berikutnya sesudah `d`. */
function quietEndsAfter(d: Date, quiet: readonly [string, string]): Date {
  const [eh, em] = hhmm(quiet[1], [6, 0]);
  const out = atTime(d, [eh, em]);
  if (out.getTime() <= d.getTime()) out.setTime(out.getTime() + DAY);
  return out;
}

function alive(t: Task): boolean {
  return !t.deletedAt && t.status !== "done" && t.status !== "archived";
}

export interface PlanInput {
  now: Date;
  tasks: readonly Task[];
  settings: UserSettings;
  /**
   * Android punya batas jumlah alarm terjadwal, jadi cuma 7 hari ke depan
   * (§6.7). Sisanya dijadwalin ulang tiap app dibuka.
   */
  horizonDays?: number;
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const { now, tasks, settings } = input;
  const horizon = now.getTime() + (input.horizonDays ?? 7) * DAY;
  const quiet = settings.quietHours;
  const out: PlannedNotification[] = [];

  // ── pengingat tenggat ─────────────────────────────────────────────────────
  for (const t of tasks) {
    if (!alive(t) || !t.dueAt) continue;
    const due = new Date(t.dueAt);
    const lead = (t.reminderMin ?? settings.defaultReminderMin) * MIN;
    let at = new Date(due.getTime() - lead);

    if (at.getTime() <= now.getTime() || at.getTime() > horizon) continue;

    /**
     * Kalau pengingatnya jatuh di jam tenang, digeser ke ujung jam tenang —
     * TAPI cuma kalau tenggatnya belum lewat waktu itu. Pengingat yang nongol
     * sesudah deadline itu bukan pengingat, itu sindiran.
     */
    if (inQuietHours(at, quiet)) {
      const moved = quietEndsAfter(at, quiet);
      if (moved.getTime() >= due.getTime()) continue;
      at = moved;
    }

    out.push({
      key: `due:${t.id}`,
      kind: "due",
      at: at.toISOString(),
      title: t.title,
      body: `Jatuh tempo ${hourLabel(due)}.`,
      data: { taskId: t.id },
    });
  }

  // ── ringkasan tertunggak, 20:00, maks 1×/hari ────────────────────────────
  const overdue = tasks.filter(
    (t) => alive(t) && t.dueAt && new Date(t.dueAt).getTime() < now.getTime(),
  );
  if (overdue.length > 0) {
    const at = atTime(now, [20, 0]);
    if (at.getTime() > now.getTime() && !inQuietHours(at, quiet)) {
      out.push({
        key: `overdue:${dayKey(now)}`,
        kind: "overdue",
        at: at.toISOString(),
        title: `${overdue.length} tugas lewat tenggat`,
        body: overdue
          .slice(0, 3)
          .map((t) => t.title)
          .join(", "),
        data: overdue[0]?.id ? { taskId: overdue[0].id } : {},
      });
    }
  }

  // ── morning brief ────────────────────────────────────────────────────────
  if (settings.morningBriefAt) {
    const t = hhmm(settings.morningBriefAt, [7, 0]);
    for (let i = 0; i < (input.horizonDays ?? 7); i++) {
      const day = new Date(now.getTime() + i * DAY);
      const at = atTime(day, t);
      if (at.getTime() <= now.getTime() || at.getTime() > horizon) continue;

      const todays = tasks.filter(
        (x) => alive(x) && x.dueAt && sameDay(new Date(x.dueAt), day),
      );
      // Sapaan pagi yang bilang "gak ada apa-apa" itu cuma bikin bangun sia-sia.
      if (todays.length === 0) continue;

      out.push({
        key: `brief:${dayKey(day)}`,
        kind: "brief",
        at: at.toISOString(),
        title: "Selamat pagi.",
        body:
          todays.length === 1
            ? `Hari ini: ${todays[0]!.title}`
            : `Hari ini: ${todays[0]!.title} (+${todays.length - 1} lagi)`,
        data: todays[0]?.id ? { taskId: todays[0].id } : {},
      });
    }
  }

  // ── review mingguan ──────────────────────────────────────────────────────
  if (settings.weeklyReviewAt) {
    const m = settings.weeklyReviewAt.match(/^([A-Z]{3})\s+(\d{1,2}):(\d{2})$/);
    const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].indexOf(m?.[1] ?? "SUN");
    if (m && dow >= 0) {
      for (let i = 0; i < (input.horizonDays ?? 7); i++) {
        const day = new Date(now.getTime() + i * DAY);
        if (day.getDay() !== dow) continue;
        const at = atTime(day, [Number(m[2]), Number(m[3])]);
        if (at.getTime() <= now.getTime() || at.getTime() > horizon) continue;
        out.push({
          key: `review:${dayKey(day)}`,
          kind: "review",
          at: at.toISOString(),
          title: "Waktunya lihat minggu ini",
          body: "Lima menit buat nutup minggu.",
          data: {},
        });
      }
    }
  }

  return capPerDay(out.sort((a, b) => a.at.localeCompare(b.at)), settings.maxNotifPerDay);
}

/**
 * Maks N per hari (§6.7 aturan 1). Yang kelebihan GAK dibuang diam-diam —
 * dikumpulin jadi satu ringkasan, jadi user tetep tau ada sesuatu tanpa
 * HP-nya bunyi tujuh kali.
 */
function capPerDay(sorted: PlannedNotification[], max: number): PlannedNotification[] {
  if (max <= 0) return [];
  const byDay = new Map<string, PlannedNotification[]>();
  for (const n of sorted) {
    const k = dayKey(new Date(n.at));
    const arr = byDay.get(k);
    if (arr) arr.push(n);
    else byDay.set(k, [n]);
  }

  const out: PlannedNotification[] = [];
  for (const [day, list] of byDay) {
    if (list.length <= max) {
      out.push(...list);
      continue;
    }
    const keep = list.slice(0, max - 1);
    const rest = list.slice(max - 1);
    out.push(...keep);
    out.push({
      key: `summary:${day}`,
      kind: "summary",
      at: rest[0]!.at,
      title: `${rest.length} pengingat lagi`,
      body: rest
        .slice(0, 3)
        .map((n) => n.title)
        .join(", "),
      ...(rest[0]!.data.taskId ? { data: { taskId: rest[0]!.data.taskId } } : { data: {} }),
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hourLabel(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `jam ${h}.${m}`;
}
