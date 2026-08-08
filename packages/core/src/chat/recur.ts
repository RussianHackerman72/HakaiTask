/**
 * Ekspansi jadwal berulang jadi okurensi — PLAN-CHAT.md T8 / E2 / E19
 *
 * Kenapa modul ini ada: `blocksOnDate()` di web cuma nyocokin
 * `sameDay(startAt)`. Artinya blok "standup tiap hari kerja" cuma nongol di
 * tanggal dia dibikin, dan **gak pernah muncul lagi** di hari-hari
 * berikutnya. Buat dashboard itu cuma bikin kosong; buat chat itu bikin
 * sistem **berbohong dengan yakin** ("jadwal Senin kamu kosong") — kegagalan
 * senyap yang paling mahal.
 *
 * Cakupan RRULE sengaja dibatasi persis pada bentuk yang bisa DIHASILKAN
 * `applyRecurrence()` di parser. Gak ada gunanya dukung RRULE penuh kalau gak
 * ada satu jalur pun di app yang bisa bikin bentuk itu.
 */
import type { BusyBlock } from "../types.js";
import { addDays, startOfDay } from "../parser/datetime.js";
import { startOfWeek, type DateRange } from "./range.js";

/** Satu kemunculan nyata dari sebuah blok — hasil ekspansi. */
export interface Occurrence {
  block: BusyBlock;
  startAt: string;
  endAt: string;
  /** true kalau ini hasil pengulangan, bukan tanggal aslinya. */
  repeated: boolean;
}

interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byDay?: number[];
  byMonthDay?: number;
}

const BYDAY: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/** Pagar keamanan: rentang query terpanjang yang wajar itu sebulan-dua. */
const MAX_SCAN_DAYS = 400;

export function parseRRule(rrule: string): Rule | null {
  const parts = new Map<string, string>();
  for (const chunk of rrule.split(";")) {
    const [k, v] = chunk.split("=");
    if (k && v) parts.set(k.toUpperCase(), v.toUpperCase());
  }

  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;

  const rule: Rule = { freq, interval: Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1) };

  const byDay = parts.get("BYDAY");
  if (byDay) {
    const days = byDay
      .split(",")
      .map((d) => BYDAY[d.trim()])
      .filter((d): d is number => d !== undefined);
    if (days.length > 0) rule.byDay = days;
  }

  const byMonthDay = Number(parts.get("BYMONTHDAY"));
  if (Number.isInteger(byMonthDay) && byMonthDay >= 1 && byMonthDay <= 31) {
    rule.byMonthDay = byMonthDay;
  }

  return rule;
}

function monthDiff(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

function weekDiff(a: Date, b: Date): number {
  return Math.round((startOfWeek(a).getTime() - startOfWeek(b).getTime()) / (7 * 86_400_000));
}

function matchesOn(rule: Rule, day: Date, base: Date): boolean {
  switch (rule.freq) {
    case "DAILY":
      return dayDiff(day, base) % rule.interval === 0;

    case "WEEKLY": {
      if (weekDiff(day, base) % rule.interval !== 0) return false;
      if (rule.byDay) return rule.byDay.includes(day.getDay());
      return day.getDay() === base.getDay();
    }

    case "MONTHLY": {
      if (monthDiff(day, base) % rule.interval !== 0) return false;
      return day.getDate() === (rule.byMonthDay ?? base.getDate());
    }
  }
}

/**
 * Semua kemunculan `block` yang bersinggungan dengan `range`.
 *
 * Pencocokannya pakai **tumpang-tindih interval**, bukan "tanggal mulainya
 * sama" — biar agenda 23:00–01:00 tetap kehitung di dua hari yang dia
 * lewati (E19), bukan ilang dari salah satunya.
 */
export function expandBlock(block: BusyBlock, range: DateRange): Occurrence[] {
  const base = new Date(block.startAt);
  const end = new Date(block.endAt);
  const durationMs = Math.max(0, end.getTime() - base.getTime());

  const hit = (start: Date, repeated: boolean): Occurrence | null => {
    const s = start.getTime();
    const e = s + durationMs;
    if (e <= range.from.getTime() || s >= range.to.getTime()) return null;
    return {
      block,
      startAt: new Date(s).toISOString(),
      endAt: new Date(e).toISOString(),
      repeated,
    };
  };

  const rule = block.recurrence ? parseRRule(block.recurrence) : null;
  if (!rule) {
    const one = hit(base, false);
    return one ? [one] : [];
  }

  // Mulai memindai dari hari paling awal yang okurensinya masih mungkin
  // nyentuh rentang — tapi gak pernah sebelum tanggal asli blok-nya.
  const earliest = new Date(range.from.getTime() - durationMs);
  let cursor = startOfDay(earliest > base ? earliest : base);
  const stopAt = range.to.getTime();

  const out: Occurrence[] = [];
  for (let i = 0; i < MAX_SCAN_DAYS && cursor.getTime() < stopAt; i++) {
    if (cursor.getTime() >= startOfDay(base).getTime() && matchesOn(rule, cursor, base)) {
      const start = new Date(cursor);
      start.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0);
      const occ = hit(start, start.getTime() !== base.getTime());
      if (occ) out.push(occ);
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Ekspansi banyak blok sekaligus, terurut menaik. */
export function expandBlocks(
  blocks: readonly BusyBlock[],
  range: DateRange,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const b of blocks) out.push(...expandBlock(b, range));
  return out.sort((a, z) => a.startAt.localeCompare(z.startAt));
}
