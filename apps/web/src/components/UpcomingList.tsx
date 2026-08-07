import { AnimatePresence, motion } from "framer-motion";
import type { BusyBlock, Task } from "@hakaitask/core";
import { clock, isOverdue, whenLabel } from "../lib/format.js";
import { listContainer, listItem } from "../lib/motion.js";
import { completeTask } from "../lib/tasks.js";
import { Checkbox, StrikeText } from "./Checkbox.js";

export type UpcomingEntry =
  | { kind: "task"; at?: string; task: Task }
  | { kind: "busy"; at: string; block: BusyBlock };

/**
 * Gabungkan task berikutnya dengan blok sibuk, urut waktu (§7.5).
 * Task tanpa waktu ditaruh paling belakang — dia gak berebut slot jam.
 */
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

  return entries.sort((a, b) => {
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
}

export function UpcomingList({
  entries,
  now,
  onOpen,
}: {
  entries: UpcomingEntry[];
  now: Date;
  onOpen: (task: Task) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="t-meta text-ink40">Berikutnya</h2>
      <motion.ul
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="mt-3 border-t-2 border-ink"
      >
        <AnimatePresence initial={false}>
          {entries.map((entry) =>
            entry.kind === "busy" ? (
              <BusyRow key={entry.block.id} block={entry.block} now={now} />
            ) : (
              <TaskRow
                key={entry.task.id}
                task={entry.task}
                now={now}
                onOpen={() => onOpen(entry.task)}
              />
            ),
          )}
        </AnimatePresence>
      </motion.ul>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <motion.li
      variants={listItem}
      exit="exit"
      layout
      className="flex items-center gap-4 overflow-hidden border-b border-line py-3"
    >
      {children}
    </motion.li>
  );
}

function TaskRow({ task, now, onOpen }: { task: Task; now: Date; onOpen: () => void }) {
  const overdue = isOverdue(task, now);
  const when = whenLabel(task.dueAt ?? task.startAt, now, task.allDay);
  const done = task.status === "done";

  return (
    <Row>
      <Checkbox
        checked={done}
        onChange={() => completeTask(task)}
        label={`Selesaikan ${task.title}`}
        size={18}
      />

      <span className={`t-mono w-20 shrink-0 ${overdue ? "text-accent" : "text-ink40"}`}>
        {when}
      </span>

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left text-[15px] text-ink"
      >
        <StrikeText done={done}>{task.title}</StrikeText>
      </button>

      {task.priority <= 2 && (
        <span className={task.priority === 1 ? "badge-solid !bg-accent shrink-0" : "badge-outline shrink-0"}>
          P{task.priority}
        </span>
      )}
    </Row>
  );
}

function BusyRow({ block, now }: { block: BusyBlock; now: Date }) {
  const start = new Date(block.startAt);
  const sameDay = start.toDateString() === now.toDateString();

  return (
    <Row>
      <span aria-hidden className="w-[18px] shrink-0" />
      <span className="t-mono w-20 shrink-0 text-ink40">
        {sameDay ? clock(start) : whenLabel(block.startAt, now)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] text-ink70">{block.title}</span>
      <span className="t-mono shrink-0 text-ink40">sibuk</span>
    </Row>
  );
}
