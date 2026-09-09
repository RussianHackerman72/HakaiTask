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
import { platform } from "./platform.js";
import { selectBusyBlocks, selectTasks } from "./select.js";

/** `crypto.randomUUID` gak ada di Hermes — jadi disuntik lewat adapter. */
export function newId(): string {
  return platform().uuid();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function useTasks(): Task[] {
  const map = useKaiStore((s) => s.tasks);
  return useMemo(() => selectTasks(map), [map]);
}

export function useBusyBlocks(): BusyBlock[] {
  const map = useKaiStore((s) => s.busyBlocks);
  return useMemo(() => selectBusyBlocks(map), [map]);
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

/**
 * Ubah hasil parser jadi Task. **Selalu** Task sekarang.
 *
 * Dulu `kind: "busy"` (dipicu kata kayak "rapat"/"jadwalin") bikin BusyBlock
 * — jenis terpisah tanpa status selesai. Itu bikin pemisahan yang gak pernah
 * diminta user: bikin sesuatu pakai kata "rapat", lalu "tampilin task" gak
 * nemu, dan sebaliknya. Orang gak mikir "ini task apa jadwal", dia cuma tau
 * ada sesuatu di hari Rabu.
 *
 * Info waktunya gak ada yang hilang: rentang jam eksplisit ("jam 3-4") tetap
 * kesimpan di `startAt` + `estimateMin`. BusyBlock lama tetap kebaca, kehapus,
 * dan bisa digeser — cuma gak dibikin baru lagi.
 */
export function createFromParse(parsed: ParseResult, userId: string): string {
  const store = useKaiStore.getState();
  const id = newId();

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

/**
 * Field yang GAK boleh diisi dari luar, walau tipenya ngizinin.
 *
 * `actualMin` yang paling penting: dia CACHE, dihitung ulang dari daftar sesi
 * fokus (`recomputeActualMin`). Diisi tangan sekali aja, angkanya bakal beda
 * sama sesi yang mendasarinya sampai ada sesi baru yang nimpa — dan sampai
 * itu kejadian, laporan waktunya bohong tanpa ada yang tau.
 *
 * Sisanya punya klien/sinkronisasi: `syncState` gak pernah dikirim ke server,
 * `rescheduleCount` cuma naik lewat aksi geser jadwal, dan `deletedAt` itu
 * nisan yang cuma boleh dipasang `removeTask`.
 */
const TERLARANG = ["actualMin", "syncState", "rescheduleCount", "deletedAt"] as const;

export type NewTaskInput = Omit<
  Partial<Task>,
  "id" | "userId" | (typeof TERLARANG)[number]
> & { title: string };

/**
 * Bikin task LANGSUNG, tanpa lewat parser.
 *
 * Sampai sekarang satu-satunya jalan bikin task itu `createFromParse`, dan dia
 * minta `ParseResult` — bentuk yang isinya separuh urusan parser (`matched`,
 * `unmatched`, `approxTime`, `kind`). Ngarang `ParseResult` palsu cuma buat
 * lewatin form itu bakal bikin form-nya keliatan kayak hasil parse, dan bikin
 * tiap perubahan di parser kudu mikirin pemanggil yang bukan parser.
 *
 * Ini SENGAJA nyalahin catatan di `apps/web/src/App.tsx` sama
 * `apps/mobile/app/(tabs)/calendar.tsx` yang bilang chat itu satu-satunya
 * pintu masuk. Form-nya saudara chat, bukan penggantinya: parser tetap jalur
 * utama, dan form ini buat momen "males ngetik kalimat".
 */
export function createTask(input: NewTaskInput, userId: string): string {
  const id = newId();

  // Disaring lagi pas jalan, bukan cuma di tipe: `input` sering datang dari
  // form yang nyebar objek, dan tipe gak nolong kalau ada `as` di jalan.
  const bersih = { ...input } as Record<string, unknown>;
  for (const k of TERLARANG) delete bersih[k];

  const task = makeTask({
    ...(bersih as Partial<Task>),
    id,
    userId,
    title: input.title.trim(),
  });

  useKaiStore.getState().upsertTask(task);
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

/**
 * Terapin rencana pindah dari papan kanban.
 *
 * Rencananya dihitung `planMove()` yang murni; di sini cuma nulisnya. Yang
 * penting urutannya: nomor ulang (kalau ada) DULUAN, baru kartu yang digeser.
 * Kebalik, kartunya sempat mendarat di antara angka lama yang sebentar lagi
 * ditimpa, dan posisinya meleset satu baris.
 *
 * `completedAt` ikut diurus di sini karena mindahin kartu ke kolom "Kelar"
 * itu SAMA artinya sama nyentang task — kalau enggak, task-nya kelar tapi gak
 * pernah kecatat kapan, dan review mingguan ikut salah.
 */
export function applyBoardMove(
  taskId: string,
  plan: { status: Task["status"]; order: number; renumber?: { id: string; order: number }[] },
): void {
  const store = useKaiStore.getState();

  for (const r of plan.renumber ?? []) store.patchTask(r.id, { order: r.order });

  const sekarang = store.tasks[taskId];
  const patch: Partial<Task> = { status: plan.status, order: plan.order };

  if (plan.status === "done" && sekarang?.status !== "done") {
    patch.completedAt = nowIso();
  } else if (plan.status !== "done" && sekarang?.status === "done") {
    // Ditarik keluar dari "Kelar" — stempel waktunya ikut dicabut, bukan
    // ditinggal jadi sisa yang bikin task keliatan pernah selesai.
    patch.completedAt = undefined;
  }

  store.patchTask(taskId, patch);
}

export function subtaskProgress(task: Task): { done: number; total: number } {
  return {
    done: task.subtasks.filter((s) => s.done).length,
    total: task.subtasks.length,
  };
}
