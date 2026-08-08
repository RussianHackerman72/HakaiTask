/**
 * Jembatan antara store core dan UI: seleksi + aksi.
 * Semua aksi nulis ke store lokal dulu (optimistik) — outbox yang urus sisanya.
 */
import { useMemo } from "react";
import {
  inferEnergyMode,
  makeTask,
  selectFocus,
  type BusyBlock,
  type Energy,
  type FocusSelection,
  type ParseResult,
  type Task,
} from "@hakaitask/core";
import { useKaiStore } from "@hakaitask/core/store";

export function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function useTasks(): Task[] {
  const map = useKaiStore((s) => s.tasks);
  return useMemo(
    () => Object.values(map).filter((t) => !t.deletedAt && t.status !== "archived"),
    [map],
  );
}

export function useBusyBlocks(): BusyBlock[] {
  const map = useKaiStore((s) => s.busyBlocks);
  return useMemo(
    () =>
      Object.values(map)
        // Jadwal sekarang dihapus pakai tombstone (biar sync-nya jujur), jadi
        // yang udah dihapus harus disaring di sini — persis kayak task.
        .filter((b) => !b.deletedAt)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [map],
  );
}

/** Mode energi efektif: "auto" diterjemahkan dari jam (§6.6). */
export function useEnergyMode(now: Date): Energy {
  const mode = useKaiStore((s) => s.settings?.energyMode ?? "auto");
  return mode === "auto" ? inferEnergyMode(now) : mode;
}

export function useFocus(now: Date, upcomingCount = 5): FocusSelection {
  const tasks = useTasks();
  const energyMode = useEnergyMode(now);
  // `now` dibulatkan ke menit oleh useNow, jadi memo ini gak ke-bust tiap render.
  return useMemo(
    () => selectFocus(tasks, { now, energyMode }, upcomingCount),
    [tasks, now, energyMode, upcomingCount],
  );
}

// ── aksi ─────────────────────────────────────────────────────────────────────

/** Ubah hasil parser jadi Task (atau BusyBlock kalau niatnya "jadwal"). */
export function createFromParse(parsed: ParseResult, userId: string): string {
  const store = useKaiStore.getState();
  const id = newId();

  // Parser nulis jam tunggal ("jam 3") ke dueAt, cuma rentang eksplisit
  // ("jam 3-4") yang kepisah startAt/endAt — jadi anchor busy block ambil
  // yang mana aja yang keisi (§6.1.6).
  if (parsed.kind === "busy" && (parsed.startAt ?? parsed.dueAt)) {
    const start = parsed.startAt ?? parsed.dueAt!;
    const end = parsed.endAt ?? new Date(start.getTime() + (parsed.estimateMin ?? 60) * 60_000);
    store.upsertBusyBlock({
      id,
      userId,
      title: parsed.title,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
    });
    return id;
  }

  const task = makeTask({
    id,
    userId,
    title: parsed.title,
    allDay: parsed.allDay,
    tags: parsed.tags,
    subtasks: parsed.subtasks.map((title, i) => ({
      id: newId(),
      title,
      done: false,
      order: i,
    })),
    ...(parsed.dueAt ? { dueAt: parsed.dueAt.toISOString() } : {}),
    ...(parsed.startAt ? { startAt: parsed.startAt.toISOString() } : {}),
    ...(parsed.priority ? { priority: parsed.priority } : {}),
    ...(parsed.estimateMin !== undefined ? { estimateMin: parsed.estimateMin } : {}),
    ...(parsed.energy ? { energy: parsed.energy } : {}),
    ...(parsed.notes ? { notes: parsed.notes } : {}),
    ...(parsed.reminderMin !== undefined ? { reminderMin: parsed.reminderMin } : {}),
    ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
  });

  store.upsertTask(task);
  return id;
}

export function completeTask(task: Task): void {
  useKaiStore.getState().patchTask(task.id, {
    status: "done",
    completedAt: nowIso(),
  });
}

export function uncompleteTask(task: Task): void {
  useKaiStore.getState().patchTask(task.id, {
    status: "todo",
    completedAt: undefined,
  });
}

export function startTask(task: Task): void {
  useKaiStore.getState().patchTask(task.id, { status: "doing" });
}

/**
 * Snooze menggeser due date DAN menaikkan rescheduleCount — angka itu yang
 * nanti dipakai review mingguan buat nunjukin task yang terus digeser (§6.4).
 */
export function snoozeTask(task: Task, until: Date): void {
  useKaiStore.getState().patchTask(task.id, {
    snoozedUntil: until.toISOString(),
    dueAt: until.toISOString(),
    rescheduleCount: task.rescheduleCount + 1,
  });
}

export function archiveTask(task: Task): void {
  useKaiStore.getState().patchTask(task.id, { status: "archived" });
}

export function deleteTask(task: Task): void {
  useKaiStore.getState().removeTask(task.id);
}

export function toggleSubtask(task: Task, subtaskId: string): void {
  useKaiStore.getState().patchTask(task.id, {
    subtasks: task.subtasks.map((s) =>
      s.id === subtaskId ? { ...s, done: !s.done } : s,
    ),
  });
}

export function addSubtask(task: Task, title: string): void {
  useKaiStore.getState().patchTask(task.id, {
    subtasks: [
      ...task.subtasks,
      { id: newId(), title, done: false, order: task.subtasks.length },
    ],
  });
}

export function patchTask(id: string, patch: Partial<Task>): void {
  useKaiStore.getState().patchTask(id, patch);
}

export function subtaskProgress(task: Task): { done: number; total: number } {
  return {
    done: task.subtasks.filter((s) => s.done).length,
    total: task.subtasks.length,
  };
}
