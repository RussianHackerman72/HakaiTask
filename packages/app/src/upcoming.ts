/**
 * Gabungan "berikutnya": task + blok sibuk, urut waktu (§7.5).
 *
 * Dipindah ke sini karena fungsinya ADA DUA KALI, sama persis baris per
 * baris, di `apps/web/src/components/UpcomingList.tsx` dan padanannya di
 * mobile. Gak pernah kelihatan salah — justru karena dua salinannya kebetulan
 * masih sama. Yang pertama diubah cuma di satu sisi bikin dashboard web dan
 * HP ngurutin hal yang sama dengan cara yang beda, dan bedanya cuma kelihatan
 * kalau dua-duanya dibuka berdampingan.
 */
import type { BusyBlock, Task } from "@hakaitask/core";

export type UpcomingEntry =
  | { kind: "task"; at?: string; task: Task }
  | { kind: "busy"; at: string; block: BusyBlock };

export function buildEntries(
  tasks: readonly Task[],
  blocks: readonly BusyBlock[],
  now: Date,
): UpcomingEntry[] {
  const entries: UpcomingEntry[] = [
    ...tasks.map<UpcomingEntry>((task) => ({
      kind: "task",
      ...(task.dueAt ?? task.startAt ? { at: task.dueAt ?? task.startAt } : {}),
      task,
    })),
    ...blocks
      .filter((b) => new Date(b.endAt).getTime() >= now.getTime())
      .map<UpcomingEntry>((block) => ({ kind: "busy", at: block.startAt, block })),
  ];

  // Task tanpa waktu ditaruh paling belakang — dia gak berebut slot jam.
  return entries.sort((a, b) => {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
}
