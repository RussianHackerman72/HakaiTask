import { motion } from "framer-motion";
import { press, rise } from "../lib/motion.js";

export type EmptyKind = "fresh" | "all-done";

/**
 * Teks dengan sapuan kilau — empty state gak boleh terasa kayak error (§7.4).
 *
 * Dua keadaan ini beda arti dan gak boleh dikasih pesan yang sama:
 * - `fresh`    belum ada apa-apa → ajakin nulis
 * - `all-done` ada task tapi kelar semua → RAYAIN, ini momen paling enak di
 *              aplikasi to-do dan sayang kalau dilewatin
 */
export function EmptyState({
  kind = "fresh",
  doneToday = 0,
  onAdd,
}: {
  kind?: EmptyKind;
  doneToday?: number;
  onAdd: () => void;
}) {
  const allDone = kind === "all-done";

  return (
    <motion.div variants={rise} initial="hidden" animate="show" className="card p-6">
      <p className="shiny text-[22px] font-extrabold leading-7">
        {allDone ? "Beres semua. Mantap." : "Kosong. Nikmatin dulu."}
      </p>
      <p className="mt-2 text-[15px] font-medium leading-6 text-ink70">
        {allDone
          ? `${doneToday} task kelar hari ini. Sisanya buat besok.`
          : "Kalau ada yang kepikiran, tulis aja apa adanya — “bsk jam 2 rapat klien”."}
      </p>
      <motion.button type="button" whileTap={press} onClick={onAdd} className="btn-pill mt-5">
        {allDone ? "Tambah satu lagi" : "Tambah task"}
      </motion.button>

      <style>{`
        .shiny {
          background: linear-gradient(
            100deg,
            var(--c-ink40) 30%,
            var(--c-ink) 50%,
            var(--c-ink40) 70%
          );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shine 3.2s linear infinite;
        }
        @keyframes shine {
          from { background-position: 180% 0; }
          to   { background-position: -80% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .shiny { animation: none; color: var(--c-ink); }
        }
      `}</style>
    </motion.div>
  );
}
