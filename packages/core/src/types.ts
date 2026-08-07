/**
 * Tipe inti KaiTask — PLAN.md §3.1
 *
 * ATURAN KERAS: file ini (dan seluruh packages/core) tidak boleh meng-import
 * apa pun dari `react`, `react-native`, atau DOM. Murni TypeScript.
 */

export type Priority = 1 | 2 | 3 | 4;
export type Status = "todo" | "doing" | "done" | "archived";
export type Energy = "low" | "medium" | "high";
export type SyncState = "local" | "synced" | "pending" | "conflict";

/** ISO 8601 string. Semua waktu disimpan dalam UTC. */
export type ISODate = string;

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  order: number;
}

export interface Task {
  id: string;
  userId: string;

  title: string;
  notes?: string;
  status: Status;
  priority: Priority;

  // waktu
  dueAt?: ISODate;
  startAt?: ISODate;
  allDay: boolean;
  estimateMin?: number;
  actualMin?: number;

  // konteks
  energy?: Energy;
  projectId?: string;
  tags: string[];

  // notifikasi & review
  reminderMin?: number;
  rescheduleCount: number;

  // struktur
  subtasks: Subtask[];
  blockedBy?: string[];

  // pengulangan
  recurrence?: string; // RRULE
  recurrenceParentId?: string;

  // sinkronisasi
  syncState: SyncState;

  // audit
  createdAt: ISODate;
  updatedAt: ISODate;
  completedAt?: ISODate;
  snoozedUntil?: ISODate;
  deletedAt?: ISODate;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  archived: boolean;
  order: number;
}

/**
 * Blok sibuk — jadwal tetap yang bukan task dan tidak perlu dicentang.
 * Fungsinya cuma satu: menutup slot waktu agar perhitungan celah jujur (§6.2).
 */
export interface BusyBlock {
  id: string;
  userId: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate;
  recurrence?: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId?: string;
  startedAt: ISODate;
  endedAt?: ISODate;
  minutes?: number;
  interruptions: number;
  mode: "pomodoro" | "stopwatch";
}

export interface UserSettings {
  userId: string;

  // time blocking
  workdayStart: string; // "08:00"
  workdayEnd: string; // "22:00"
  slotMin: 15 | 30;

  // energy
  energyMode: Energy | "auto";

  // focus timer
  pomodoroWorkMin: number;
  pomodoroBreakMin: number;

  // notifikasi
  morningBriefAt?: string;
  weeklyReviewAt?: string;
  defaultReminderMin: number;
  quietHours: [string, string];
  maxNotifPerDay: number;

  // estimasi
  estimateMultiplier: number;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, "userId"> = {
  workdayStart: "08:00",
  workdayEnd: "22:00",
  slotMin: 30,
  energyMode: "auto",
  pomodoroWorkMin: 25,
  pomodoroBreakMin: 5,
  morningBriefAt: "07:00",
  weeklyReviewAt: "SUN 19:00",
  defaultReminderMin: 60,
  quietHours: ["22:00", "06:00"],
  maxNotifPerDay: 4,
  estimateMultiplier: 1.0,
};

/** Entri kamus pribadi hasil "Ajarin" dari user (§6.1.7). */
export interface UserLexiconEntry {
  id: string;
  userId: string;
  dari: string;
  ke: string;
  tipe: "slang" | "niat" | "partikel" | "buang";
  createdAt: ISODate;
}

/** Task baru dengan nilai default yang wajar. */
export function makeTask(
  partial: Partial<Task> & Pick<Task, "id" | "userId" | "title">,
): Task {
  const now = new Date().toISOString();
  return {
    status: "todo",
    priority: 3,
    allDay: false,
    tags: [],
    subtasks: [],
    rescheduleCount: 0,
    syncState: "local",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}
