import { motion } from "framer-motion";
import type { Task } from "@hakaitask/core";
import { durationLabel, isOverdue, metaLine, whenLabel } from "../lib/format.js";
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

  const meta = metaLine([
    task.priority <= 2 && `P${task.priority}`,
    whenLabel(task.dueAt, now, task.allDay),
    durationLabel(task.estimateMin),
  ]);

  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.16 }}
      className={`rounded-[--radius-md] border bg-surface p-6 ${
        overdue ? "border-accent" : "border-line"
      }`}
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
            className="text-[24px] font-semibold leading-8 text-ink"
          >
            <StrikeText done={done_}>{task.title}</StrikeText>
          </motion.h2>

          {meta && (
            <p className={`t-mono mt-2 ${overdue ? "text-accent" : "text-ink40"}`}>
              {overdue ? `Lewat · ${meta}` : meta}
            </p>
          )}

          {total > 0 && <SubtaskProgress done={done} total={total} />}
        </button>

        <span aria-hidden className="pt-1 text-ink40">
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
