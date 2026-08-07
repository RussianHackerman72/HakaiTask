import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BusyBlock, Task } from "@hakaitask/core";
import {
  addMonths,
  blocksOnDate,
  monthLabel,
  monthMatrix,
  sameDay,
  tasksOnDate,
} from "../lib/calendar.js";
import { clock, headerDate } from "../lib/format.js";
import { listContainer, listItem, press, rise } from "../lib/motion.js";
import { completeTask } from "../lib/tasks.js";
import { Checkbox, StrikeText } from "./Checkbox.js";
import { DashboardQuickAdd } from "./DashboardQuickAdd.js";

const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function CalendarView({
  now,
  tasks,
  blocks,
  userId,
  onOpenTask,
}: {
  now: Date;
  tasks: Task[];
  blocks: BusyBlock[];
  userId: string;
  onOpenTask: (task: Task) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(() => new Date(now));

  const days = useMemo(() => monthMatrix(viewMonth.getFullYear(), viewMonth.getMonth()), [viewMonth]);
  const selectedTasks = useMemo(() => tasksOnDate(tasks, selected), [tasks, selected]);
  const selectedBlocks = useMemo(() => blocksOnDate(blocks, selected), [blocks, selected]);

  return (
    <motion.div variants={rise} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="t-display text-[32px] leading-9 text-ink">{monthLabel(viewMonth)}</h1>
        <div className="flex items-center gap-2">
          <NavButton label="Bulan sebelumnya" onClick={() => setViewMonth((m) => addMonths(m, -1))}>
            ‹
          </NavButton>
          <button
            type="button"
            onClick={() => {
              setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(new Date(now));
            }}
            className="btn-pill-outline py-2 text-[13px]"
          >
            Hari ini
          </button>
          <NavButton label="Bulan berikutnya" onClick={() => setViewMonth((m) => addMonths(m, 1))}>
            ›
          </NavButton>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-7 gap-1.5">
          {HARI_PENDEK.map((h) => (
            <div key={h} className="t-meta pb-1 text-center text-ink40">
              {h}
            </div>
          ))}

          {days.map((day) => {
            const inMonth = day.getMonth() === viewMonth.getMonth();
            const isToday = sameDay(day, now);
            const isSelected = sameDay(day, selected);
            const count = tasksOnDate(tasks, day).length + blocksOnDate(blocks, day).length;

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelected(day)}
                className={`relative aspect-square rounded-2xl text-[15px] font-bold transition-colors duration-[--dur-fast] ${
                  isSelected
                    ? "bg-ink text-paper"
                    : isToday
                      ? "border-2 border-ink text-ink"
                      : inMonth
                        ? "text-ink hover:bg-surface"
                        : "text-ink40"
                }`}
              >
                {day.getDate()}
                {count > 0 && (
                  <span
                    aria-hidden
                    className={`absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                      isSelected ? "bg-paper" : "bg-ink"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-[20px] font-extrabold text-ink">{headerDate(selected)}</h2>

        <DashboardQuickAdd
          now={now}
          userId={userId}
          forcedDate={selected}
          placeholder={`Tambah task buat ${headerDate(selected)}…`}
        />

        {selectedTasks.length === 0 && selectedBlocks.length === 0 ? (
          <p className="text-[15px] font-medium text-ink40">Gak ada apa-apa di tanggal ini.</p>
        ) : (
          <motion.ul variants={listContainer} initial="hidden" animate="show" className="space-y-2">
            <AnimatePresence initial={false}>
              {selectedBlocks.map((b) => (
                <motion.li
                  key={b.id}
                  variants={listItem}
                  exit="exit"
                  layout
                  className="card flex items-center gap-3 px-4 py-3"
                >
                  <span className="t-mono w-16 shrink-0 text-ink40">{clock(new Date(b.startAt))}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink70">
                    {b.title}
                  </span>
                  <span className="badge-outline shrink-0">sibuk</span>
                </motion.li>
              ))}

              {selectedTasks.map((task) => {
                const done = task.status === "done";
                return (
                  <motion.li
                    key={task.id}
                    variants={listItem}
                    exit="exit"
                    layout
                    className="card flex items-center gap-3 px-4 py-3"
                  >
                    <Checkbox
                      checked={done}
                      onChange={() => completeTask(task)}
                      label={`Selesaikan ${task.title}`}
                      size={20}
                    />
                    {!task.allDay && task.dueAt && (
                      <span className="t-mono w-16 shrink-0 text-ink40">
                        {clock(new Date(task.dueAt))}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-ink"
                    >
                      <StrikeText done={done}>{task.title}</StrikeText>
                    </button>
                    {task.priority <= 2 && (
                      <span
                        className={
                          task.priority === 1 ? "badge-solid !bg-accent shrink-0" : "badge-outline shrink-0"
                        }
                      >
                        P{task.priority}
                      </span>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>
    </motion.div>
  );
}

function NavButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={press}
      onClick={onClick}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink text-[18px] font-bold text-ink transition-colors duration-[--dur-fast] hover:bg-surface"
    >
      {children}
    </motion.button>
  );
}
