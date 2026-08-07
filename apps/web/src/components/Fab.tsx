import { motion } from "framer-motion";
import { enterTransition, press } from "../lib/motion.js";

/** Tombol tambah mengambang (§7.5). Setara Ctrl+K buat yang gak pakai keyboard. */
export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={press}
      whileHover={{ y: -2 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={enterTransition}
      aria-label="Tambah task"
      className="fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-full border border-line bg-surface text-[22px] text-ink transition-colors duration-[--dur-fast] hover:bg-paper"
    >
      +
    </motion.button>
  );
}
