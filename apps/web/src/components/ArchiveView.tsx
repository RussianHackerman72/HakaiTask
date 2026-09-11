/**
 * Arsip — task yang disingkirin tapi gak dibuang.
 *
 * Kembaran `apps/mobile/app/archive.tsx`. Logikanya (`selectArchived`,
 * `unarchiveTask`) dipakai bareng dari `packages/app`; yang ditulis dua kali
 * cuma render-nya, karena `packages/app` emang gak boleh nyentuh `react-dom`
 * maupun `react-native` — dijaga `purity.test.ts`.
 *
 * Kenapa dia BUKAN tab kelima di navbar: arsip itu tempat yang dikunjungi
 * sesekali, bukan yang ditongkrongin. Naruh dia sejajar chat/dashboard/
 * kalender/papan bikin dia keliatan sepenting itu. Di mobile dia disimpen di
 * balik Setelan dengan alasan yang sama; di web jalannya lewat command
 * palette, karena web gak punya layar Setelan sama sekali.
 */
import { motion } from "framer-motion";
import type { Task } from "@hakaitask/core";
import { unarchiveTask } from "@hakaitask/app/tasks";
import { whenLabel } from "@hakaitask/app/format";
import { listContainer, listItem, press } from "../lib/motion.js";

export function ArchiveView({
  tasks,
  now,
  onOpenTask,
}: {
  tasks: Task[];
  now: Date;
  onOpenTask: (task: Task) => void;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Arsip</h2>
        <p className="max-w-prose text-[15px] text-ink70">
          Task di sini gak ikut papan, gak ikut pencarian, dan gak bakal
          ngingetin kamu. Tapi gak kehapus — bisa dibalikin kapan aja.
        </p>
      </header>

      {tasks.length === 0 ? (
        /*
          Kosong itu keadaan yang PALING sering di layar ini, jadi dia dapet
          kalimatnya sendiri. Layar kosong tanpa penjelasan gampang kebaca
          sebagai layar yang rusak.
        */
        <div className="rounded-3xl bg-surface p-6">
          <p className="font-medium text-ink">Belum ada yang diarsipin</p>
          <p className="mt-1 text-[15px] text-ink70">
            Buka satu task, lalu pilih “Arsipkan” kalau kamu pengin dia nyingkir
            dari papan tanpa dihapus.
          </p>
        </div>
      ) : (
        <motion.ul variants={listContainer} initial="hidden" animate="show" className="space-y-3">
          {tasks.map((t) => (
            <motion.li
              key={t.id}
              variants={listItem}
              className="flex items-start justify-between gap-4 rounded-3xl bg-surface p-5"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenTask(t)}
                  className="text-left text-[15px] font-medium text-ink hover:underline"
                >
                  {t.title}
                </button>
                {t.dueAt && (
                  <p className="mt-1 text-[13px] tabular-nums text-ink40">
                    Tenggatnya dulu {whenLabel(t.dueAt, now, t.allDay)}
                  </p>
                )}
              </div>

              <motion.button
                type="button"
                whileTap={press}
                onClick={() => unarchiveTask(t)}
                className="shrink-0 rounded-full bg-subtle px-4 py-2 text-[13px] font-medium text-ink"
              >
                Balikin
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
