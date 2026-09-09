/**
 * Papan kanban — tiga kolom berdampingan, kartunya diseret.
 *
 * Beda dari mobile, yang mindahin kartunya lewat menu. Bukan karena web lebih
 * "canggih": di HP, seret di dalam daftar yang bisa digulir, di dalam halaman
 * yang bisa digeser mendatar, artinya tiga gestur rebutan satu jari. Di sini
 * ada kursor — nunjuk itu tepat, dan seret gak nabrak gulir. Bentuknya beda
 * karena alat masukannya beda, dan itu memang alasan yang sah.
 *
 * Seretnya pakai HTML5 drag-and-drop bawaan, bukan pustaka: yang dibutuhin
 * cuma "kartu apa, mendarat di mana", dan itu persis yang dikasih
 * `dataTransfer` + `dragover`. Nambah pustaka dnd buat ini artinya nambah
 * ratusan kilobyte demi perilaku yang udah ada di browser.
 *
 * Aritmatika urutannya gak ada di sini sama sekali — semuanya di
 * `@hakaitask/app/kanban`, dipakai bareng sama mobile. Itu yang bikin urutan
 * papan di HP dan di laptop gak bisa beda pendapat.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Task } from "@hakaitask/core";
import {
  KANBAN_COLUMNS,
  KANBAN_LABEL,
  board,
  planMove,
  type KanbanColumn,
} from "@hakaitask/app/kanban";
import { applyBoardMove } from "@hakaitask/app/tasks";
import { whenLabel, isOverdue } from "@hakaitask/app/format";

export function KanbanView({
  tasks,
  now,
  onOpenTask,
}: {
  tasks: Task[];
  now: Date;
  onOpenTask: (task: Task) => void;
}) {
  const kolom = useMemo(() => board(tasks), [tasks]);

  /** Kolom yang lagi dilewatin kursor — cuma buat sorotan, bukan state data. */
  const [atas, setAtas] = useState<KanbanColumn | null>(null);

  const jatuhin = (col: KanbanColumn, index: number, id: string) => {
    setAtas(null);
    if (!id) return;
    const plan = planMove(tasks, id, col, index);
    if (plan) applyBoardMove(id, plan);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {KANBAN_COLUMNS.map((col) => (
        <section
          key={col}
          aria-label={KANBAN_LABEL[col]}
          onDragOver={(e) => {
            // Tanpa preventDefault, browser nolak jatuhannya dan kartunya
            // mental balik — gejala paling umum dari dnd HTML5 yang "gak jalan".
            e.preventDefault();
            setAtas(col);
          }}
          onDragLeave={() => setAtas((c) => (c === col ? null : c))}
          onDrop={(e) => {
            e.preventDefault();
            jatuhin(col, kolom[col].length, e.dataTransfer.getData("text/plain"));
          }}
          className={[
            "rounded-[var(--radius-md)] p-3 transition-colors",
            atas === col ? "bg-surface" : "bg-transparent",
          ].join(" ")}
        >
          <header className="mb-2 flex items-center gap-2">
            <h2 className="t-meta font-semibold">{KANBAN_LABEL[col]}</h2>
            <span className="t-num text-ink40">{kolom[col].length}</span>
          </header>

          <ul className="flex flex-col gap-2">
            {kolom[col].length === 0 && <li className="t-meta text-ink40">Kosong.</li>}

            {kolom[col].map((t, i) => (
              <li key={t.id}>
                {/*
                  Garis jatuh SEBELUM tiap kartu. Ini yang bikin urutan di
                  dalam kolom bisa diatur, bukan cuma pindah kolom — dan tanpa
                  target setipis ini, tiap jatuhan mendarat di ujung.
                */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    jatuhin(col, i, e.dataTransfer.getData("text/plain"));
                  }}
                  className="h-2 -mb-1"
                  aria-hidden
                />

                <motion.article
                  layout
                  draggable
                  onDragStart={(e) => {
                    (e as unknown as React.DragEvent).dataTransfer.setData("text/plain", t.id);
                  }}
                  onClick={() => onOpenTask(t)}
                  className="card cursor-grab p-3 active:cursor-grabbing"
                >
                  <div className="t-body">{t.title}</div>
                  {t.dueAt && (
                    <div
                      className={`t-meta mt-1 ${
                        isOverdue(t, now) ? "text-accent" : "text-ink40"
                      }`}
                    >
                      {whenLabel(t.dueAt, now, t.allDay)}
                    </div>
                  )}
                </motion.article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
