import { motion } from "framer-motion";
import { press, rise } from "../lib/motion.js";

/** Teks dengan sapuan kilau — empty state gak boleh terasa kayak error (§7.4). */
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      className="rounded-[--radius-md] border border-line bg-surface p-6"
    >
      <p className="shiny text-[20px] font-semibold leading-7">Kosong. Nikmatin dulu.</p>
      <p className="mt-2 text-[15px] leading-6 text-ink70">
        Kalau ada yang kepikiran, tulis aja apa adanya — “bsk jam 2 rapat klien”.
      </p>
      <motion.button
        type="button"
        whileTap={press}
        onClick={onAdd}
        className="t-meta mt-5 rounded-[--radius-sm] border border-line px-3 py-1.5 text-ink transition-colors duration-[--dur-fast] hover:bg-paper"
      >
        Tambah task
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
