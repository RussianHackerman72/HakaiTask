/**
 * Helper tanggal & jam Bahasa Indonesia — PLAN.md §6.1.6
 * Tidak ada dependensi eksternal: `chrono-node` tidak punya locale `id`.
 */

export type Meridiem = "am" | "pm";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function setTime(d: Date, h: number, m = 0): Date {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

/**
 * Aturan jam ambigu (§6.1.6): `jam 2` = 14:00, `jam 7` = 07:00.
 * Jam 1–6 dibaca sore, 7–11 dibaca pagi, 12 tetap siang.
 * Meridiem eksplisit ("pagi"/"malam") selalu menang.
 */
export function resolveHour(hour: number, meridiem?: Meridiem): number {
  if (hour < 0 || hour > 23) return hour;
  if (meridiem === "am") return hour === 12 ? 0 : hour;
  if (meridiem === "pm") return hour < 12 ? hour + 12 : hour;
  if (hour >= 13) return hour;
  if (hour === 12) return 12;
  if (hour === 0) return 0;
  return hour <= 6 ? hour + 12 : hour;
}

/** Hari kerja terdekat ke depan untuk `weekday` (0=Minggu). */
export function nextWeekday(now: Date, weekday: number, mode: "nearest" | "this" | "next" = "nearest"): Date {
  const base = startOfDay(now);
  const current = base.getDay();
  let delta = (weekday - current + 7) % 7;

  if (mode === "nearest") {
    if (delta === 0) delta = 7; // hari ini Senin & user bilang "senin" → Senin depan
  } else if (mode === "this") {
    // biarkan delta apa adanya (0 = hari ini)
  } else {
    delta = delta === 0 ? 7 : delta + 7;
  }
  return addDays(base, delta);
}

/** Tanggal N pada bulan berjalan; kalau sudah lewat, lompat ke bulan depan. */
export function nextMonthDay(now: Date, day: number): Date {
  const base = startOfDay(now);
  const candidate = new Date(base.getFullYear(), base.getMonth(), day);
  if (candidate.getTime() < base.getTime()) {
    return new Date(base.getFullYear(), base.getMonth() + 1, day);
  }
  return candidate;
}

/** Tahun tidak pernah mundur (§6.1.6). */
export function nextDateOfYear(now: Date, day: number, month1: number, year?: number): Date {
  const base = startOfDay(now);
  if (year !== undefined) return new Date(year, month1 - 1, day);
  const candidate = new Date(base.getFullYear(), month1 - 1, day);
  if (candidate.getTime() < base.getTime()) {
    return new Date(base.getFullYear() + 1, month1 - 1, day);
  }
  return candidate;
}

/** Sabtu terdekat ke depan. */
export function nextWeekend(now: Date): Date {
  return nextWeekday(now, 6, "nearest");
}

export function endOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

export function startOfNextMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/** Senin minggu berikutnya. */
export function nextWeek(now: Date): Date {
  return nextWeekday(now, 1, "nearest");
}

/** "HH:MM" → menit sejak tengah malam. */
export function parseClockString(s: string): { h: number; m: number } | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}
