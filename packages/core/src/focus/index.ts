/**
 * Mesin timer fokus — PLAN.md §6.3
 *
 * ATURAN PALING PENTING di seluruh modul ini: timer TIDAK PERNAH disimpan
 * sebagai hitungan mundur yang jalan. Yang disimpan cuma cap waktu; sisa waktu
 * SELALU diturunin dari jam sistem pas dirender.
 *
 * Konsekuensinya bagus dan gratis: app di-kill, HP dikunci, layar di-background
 * sejam — pas dibuka lagi angkanya langsung bener tanpa satu baris pun kode
 * pemulihan. Kalau yang disimpan angka sisa waktu, semua itu harus ditangani
 * satu per satu, dan tiap salah satunya bikin timer bohong.
 *
 * Makanya `runningSince` yang disimpan, bukan `remaining`:
 *
 *   elapsed(now) = elapsedBeforePauseMs + (runningSince ? now - runningSince : 0)
 *
 * Satu rumus itu bener buat semua keadaan — jalan, dijeda, dan baru dibuka
 * lagi sesudah app mati.
 *
 * Modul ini MURNI: `now` selalu masuk sebagai parameter, gak ada `Date.now()`
 * tersembunyi, gak ada timer. Lapisan app yang ngurus `setInterval` buat
 * nge-render ulang — dan interval itu cuma manggil setState, gak pernah
 * ngurangin apa pun.
 */
import type { FocusSession, ISODate, UserSettings } from "../types.js";

export type FocusMode = "pomodoro" | "deep" | "stopwatch";
export type Phase = "work" | "break" | "long_break";

export interface FocusPreset {
  workMin: number;
  breakMin: number;
  longBreakMin: number;
  /** 0 = gak pernah istirahat panjang. */
  longBreakEvery: number;
}

export const FOCUS_PRESET: Record<FocusMode, FocusPreset> = {
  pomodoro: { workMin: 25, breakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  deep: { workMin: 50, breakMin: 10, longBreakMin: 10, longBreakEvery: 0 },
  stopwatch: { workMin: 0, breakMin: 0, longBreakMin: 0, longBreakEvery: 0 },
};

export interface FocusState {
  sessionId: string;
  taskId?: string;
  mode: FocusMode;
  phase: Phase;
  /** Awal fase ini — dipakai buat baris `focus_sessions`. */
  startedAt: ISODate;
  /** Kapan hitungan terakhir dilanjut. `undefined` = lagi dijeda. */
  runningSince?: ISODate;
  /** Akumulasi waktu jalan sebelum jeda terakhir. */
  elapsedBeforePauseMs: number;
  /** Target fase ini. `undefined` = stopwatch, gak ada target. */
  totalMs?: number;
  interruptions: number;
  /** Buat aturan "tiap 4 sesi kerja → istirahat panjang". */
  completedWorkSessions: number;
}

const MIN = 60_000;

function iso(d: Date): ISODate {
  return d.toISOString();
}

/** Menit kerja/istirahat efektif — setelan user menimpa preset pomodoro. */
export function presetFor(mode: FocusMode, settings?: Partial<UserSettings>): FocusPreset {
  const base = FOCUS_PRESET[mode];
  if (mode !== "pomodoro" || !settings) return base;
  return {
    ...base,
    workMin: settings.pomodoroWorkMin ?? base.workMin,
    breakMin: settings.pomodoroBreakMin ?? base.breakMin,
  };
}

function phaseMinutes(phase: Phase, preset: FocusPreset): number {
  if (phase === "work") return preset.workMin;
  if (phase === "long_break") return preset.longBreakMin;
  return preset.breakMin;
}

export interface StartInput {
  sessionId: string;
  taskId?: string;
  mode: FocusMode;
  now: Date;
  settings?: Partial<UserSettings>;
  /** Lanjutan dari sesi sebelumnya — dibawa biar hitungan "tiap 4" gak reset. */
  completedWorkSessions?: number;
  phase?: Phase;
}

export function startFocus(input: StartInput): FocusState {
  const phase = input.phase ?? "work";
  const preset = presetFor(input.mode, input.settings);
  const minutes = phaseMinutes(phase, preset);

  return {
    sessionId: input.sessionId,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    mode: input.mode,
    phase,
    startedAt: iso(input.now),
    runningSince: iso(input.now),
    elapsedBeforePauseMs: 0,
    // Stopwatch gak punya target; 0 menit juga diperlakukan sebagai tanpa target.
    ...(input.mode === "stopwatch" || minutes <= 0 ? {} : { totalMs: minutes * MIN }),
    interruptions: 0,
    completedWorkSessions: input.completedWorkSessions ?? 0,
  };
}

export function isPaused(s: FocusState): boolean {
  return s.runningSince === undefined;
}

export function pauseFocus(s: FocusState, now: Date): FocusState {
  if (isPaused(s)) return s;
  const { runningSince: _drop, ...rest } = s;
  return {
    ...rest,
    elapsedBeforePauseMs: elapsedMs(s, now),
  };
}

export function resumeFocus(s: FocusState, now: Date): FocusState {
  if (!isPaused(s)) return s;
  return { ...s, runningSince: iso(now) };
}

/**
 * Cuma nambah hitungan gangguan. TIDAK nyentuh waktu sama sekali — §6.3 tegas
 * soal ini: tombolnya gak nyetop timer. Kalau mencet tombol ini ngurangin
 * waktu fokus, orang bakal berhenti mencetnya, dan datanya jadi bohong.
 */
export function markInterrupted(s: FocusState): FocusState {
  return { ...s, interruptions: s.interruptions + 1 };
}

export function elapsedMs(s: FocusState, now: Date): number {
  const running = s.runningSince ? now.getTime() - Date.parse(s.runningSince) : 0;
  return s.elapsedBeforePauseMs + Math.max(0, running);
}

export interface FocusView {
  elapsedMs: number;
  /** `undefined` buat stopwatch. Gak pernah negatif. */
  remainingMs?: number;
  done: boolean;
  paused: boolean;
  /** "24:13" — mundur kalau ada target, maju kalau stopwatch. */
  label: string;
  phase: Phase;
  interruptions: number;
  /** Sesi keberapa yang lagi jalan, buat baris "sesi 2 · terganggu 1". */
  sessionNumber: number;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

/** Turunan MURNI buat render. Gak nyimpen apa-apa, gak ngubah apa-apa. */
export function focusView(s: FocusState, now: Date): FocusView {
  const elapsed = elapsedMs(s, now);
  const remaining = s.totalMs === undefined ? undefined : Math.max(0, s.totalMs - elapsed);
  const done = s.totalMs !== undefined && elapsed >= s.totalMs;

  return {
    elapsedMs: elapsed,
    ...(remaining === undefined ? {} : { remainingMs: remaining }),
    done,
    paused: isPaused(s),
    label: clock(remaining ?? elapsed),
    phase: s.phase,
    interruptions: s.interruptions,
    sessionNumber: s.completedWorkSessions + (s.phase === "work" ? 1 : 0),
  };
}

/**
 * Kapan fase ini mestinya bunyi — dipakai lapisan app buat menjadwalkan
 * notifikasi. Diturunin, bukan disimpan: satu-satunya sumber kebenarannya
 * tetap `runningSince`.
 */
export function endsAt(s: FocusState, _now?: Date): ISODate | undefined {
  if (s.totalMs === undefined || !s.runningSince) return undefined;
  const remaining = s.totalMs - s.elapsedBeforePauseMs;
  return iso(new Date(Date.parse(s.runningSince) + remaining));
}

export interface EndResult {
  /**
   * Baris buat `focus_sessions` — CUMA buat fase kerja. Istirahat sengaja gak
   * dicatat, kalau enggak "waktu fokus 6 jam 40 menit" di review mingguan
   * (§6.4) bakal kegelembung sama waktu istirahat.
   */
  session: FocusSession | null;
  minutes: number;
  /** Fase berikutnya kalau ada. `null` = sesi selesai. */
  next: FocusState | null;
}

export interface EndInput {
  now: Date;
  userId: string;
  /** Id buat fase berikutnya — core gak bikin id sendiri (§ mesin murni). */
  nextSessionId?: string;
  settings?: Partial<UserSettings>;
  /** Berhenti total, jangan lanjut ke istirahat. */
  stop?: boolean;
}

export function endFocus(s: FocusState, input: EndInput): EndResult {
  const elapsed = elapsedMs(s, input.now);
  const minutes = Math.round(elapsed / MIN);
  const isWork = s.phase === "work";

  const session: FocusSession | null = isWork
    ? {
        id: s.sessionId,
        userId: input.userId,
        ...(s.taskId ? { taskId: s.taskId } : {}),
        startedAt: s.startedAt,
        endedAt: iso(input.now),
        minutes,
        interruptions: s.interruptions,
        mode: s.mode,
      }
    : null;

  if (input.stop || s.mode === "stopwatch" || !input.nextSessionId) {
    return { session, minutes, next: null };
  }

  const preset = presetFor(s.mode, input.settings);
  const completed = s.completedWorkSessions + (isWork ? 1 : 0);

  // Sesudah istirahat, balik kerja. Sesudah kerja, istirahat — panjang tiap
  // kelipatan `longBreakEvery` (0 = gak pernah panjang, dipakai deep work).
  const nextPhase: Phase = isWork
    ? preset.longBreakEvery > 0 && completed % preset.longBreakEvery === 0
      ? "long_break"
      : "break"
    : "work";

  return {
    session,
    minutes,
    next: startFocus({
      sessionId: input.nextSessionId,
      ...(s.taskId ? { taskId: s.taskId } : {}),
      mode: s.mode,
      now: input.now,
      ...(input.settings ? { settings: input.settings } : {}),
      completedWorkSessions: completed,
      phase: nextPhase,
    }),
  };
}

/**
 * `task.actualMin` itu JUMLAH, bukan penghitung yang dinaikin.
 *
 * Bedanya penting: sync-nya last-write-wins per field. Kalau dua device
 * masing-masing bikin `actualMin += menit` lalu ngirim, LWW cuma nyimpen satu
 * dan menit dari device satunya HILANG diam-diam. Dihitung ulang dari daftar
 * sesi, dua device selalu ketemu angka yang sama — berapa pun urutan datangnya.
 */
export function sumActualMin(
  sessions: readonly FocusSession[],
  taskId: string,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const s of sessions) {
    if (s.taskId !== taskId || seen.has(s.id)) continue;
    seen.add(s.id);
    total += s.minutes ?? 0;
  }
  return total;
}

/** Sesi kerja yang kelar hari ini — dipakai `inferEnergyMode` (§6.6). */
export function focusSessionsToday(
  sessions: readonly FocusSession[],
  now: Date,
): number {
  return sessions.filter((s) => {
    if (!s.endedAt) return false;
    const d = new Date(s.endedAt);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;
}
