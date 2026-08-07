import { motion } from "framer-motion";
import { clock, headerDate } from "../lib/format.js";
import { press } from "../lib/motion.js";
import { SyncBadge } from "./SyncBadge.js";
import { Toggle } from "./Toggle.js";
import { useTheme } from "../lib/theme.js";
import type { Page } from "../lib/pages.js";

export function Header({
  now,
  page,
  onNavigate,
  onSignOut,
}: {
  now: Date;
  page: Page;
  onNavigate: (page: Page) => void;
  onSignOut?: () => void;
}) {
  const { resolved, toggle } = useTheme();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="t-meta text-ink40">{headerDate(now)}</div>
        <nav className="flex gap-1 rounded-full border-2 border-ink p-1">
          <NavTab active={page === "dashboard"} onClick={() => onNavigate("dashboard")}>
            Dashboard
          </NavTab>
          <NavTab active={page === "calendar"} onClick={() => onNavigate("calendar")}>
            Kalender
          </NavTab>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <SyncBadge />

        <div className="flex items-center gap-2">
          <span className="t-mono text-ink40">
            {resolved === "dark" ? "gelap" : "terang"}
          </span>
          <Toggle
            on={resolved === "dark"}
            onChange={toggle}
            label={resolved === "dark" ? "Pakai mode terang" : "Pakai mode gelap"}
          />
        </div>

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

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`t-meta rounded-full px-3.5 py-1.5 transition-colors duration-[--dur-fast] ${
        active ? "bg-ink text-paper" : "text-ink40 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
