import { motion } from "framer-motion";
import { clock, headerDate } from "../lib/format.js";
import { press } from "../lib/motion.js";
import { SyncBadge } from "./SyncBadge.js";
import { useTheme } from "../lib/theme.js";

export function Header({ now, onSignOut }: { now: Date; onSignOut?: () => void }) {
  const { resolved, toggle } = useTheme();

  return (
    <header className="flex items-baseline justify-between gap-4">
      <div className="t-meta text-ink40">{headerDate(now)}</div>

      <div className="flex items-center gap-4">
        <SyncBadge />

        <motion.button
          type="button"
          whileTap={press}
          onClick={toggle}
          className="t-mono text-ink40 transition-colors duration-[--dur-fast] hover:text-ink"
          aria-label={resolved === "dark" ? "Pakai mode terang" : "Pakai mode gelap"}
        >
          {resolved === "dark" ? "terang" : "gelap"}
        </motion.button>

        {onSignOut && (
          <motion.button
            type="button"
            whileTap={press}
            onClick={onSignOut}
            className="t-mono text-ink40 transition-colors duration-[--dur-fast] hover:text-ink"
          >
            keluar
          </motion.button>
        )}

        <div className="t-mono text-ink40">{clock(now)}</div>
      </div>
    </header>
  );
}
