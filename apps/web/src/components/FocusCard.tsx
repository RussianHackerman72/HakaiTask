import { motion } from "framer-motion";
import type { Task } from "@hakaitask/core";
import { durationLabel, isOverdue, whenLabel } from "../lib/format.js";
import { rise } from "../lib/motion.js";
import { completeTask, subtaskProgress } from "../lib/tasks.js";
import { Checkbox, StrikeText } from "./Checkbox.js";

export function FocusCard({
  task,
  now,
  onOpen,
}: {
  task: Task;
  now: Date;
  onOpen: () => void;
}) {
  const overdue = isOverdue(task, now);
  const { done, total } = subtaskProgress(task);
  const done_ = task.status === "done";

  const when = whenLabel(task.dueAt, now, task.allDay);
  const duration = durationLabel(task.estimateMin);

  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.16 }}
      className={`card p-6 ${overdue ? "border-accent" : "border-ink"}`}
    >
      <div className="flex items-start gap-4">
        <div className="pt-1">
          <Checkbox
            checked={done_}
            onChange={() => completeTask(task)}
            label={`Selesaikan ${task.title}`}
          />
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          aria-label={`Buka detail ${task.title}`}
        >
          <motion.h2
            layoutId={`task-title-${task.id}`}
            className="text-[26px] font-extrabold leading-8 text-ink"
          >
            <StrikeText done={done_}>{task.title}</StrikeText>
          </motion.h2>

          {(task.priority <= 2 || when || duration) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {overdue && <span className="badge-solid !bg-accent">Lewat</span>}
              {task.priority <= 2 && (
                <span className={overdue ? "badge-outline" : "badge-solid"}>
                  P{task.priority}
                </span>
              )}
              {when && <span className="t-mono text-ink40">{when}</span>}
              {duration && <span className="t-mono text-ink40">{duration}</span>}
            </div>
          )}

          {total > 0 && <SubtaskProgress done={done} total={total} />}
        </button>

        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink text-ink"
        >
          →
        </span>
      </div>
    </motion.div>
  );
}

function SubtaskProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full bg-ink"
          initial={{ width: 0 }}
          animate={{ width: `${(done / total) * 100}%` }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="t-mono text-ink40">
        {done}/{total}
      </span>
    </div>
  );
}
