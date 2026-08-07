import { motion, useReducedMotion } from "framer-motion";
import { dur, ease } from "../lib/motion.js";

/**
 * Kotak centang dengan garis yang digambar 180ms (§7.4 langkah 1).
 * Ini interaksi yang paling sering dilakuin — jadi dia dapat perhatian sendiri.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  size = 22,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: number;
}) {
  const reduced = useReducedMotion();

  /**
   * Area sentuh dipaksa 44px (WCAG 2.5.5 / Apple HIG) walau lingkarannya kecil.
   * Margin negatif nahan supaya padding ekstra ini gak ngedorong layout —
   * nyentang task itu aksi paling sering di app ini, target 18px gak kemakan.
   */
  const pad = Math.max(0, (44 - size) / 2);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="group grid shrink-0 place-items-center"
      style={{ padding: pad, margin: -pad }}
    >
      <span
        className="grid place-items-center rounded-full border-2 border-ink40 transition-colors duration-[var(--dur-fast)] group-hover:border-ink"
        style={{ width: size, height: size }}
      >
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 12 12" fill="none">
          <motion.path
            d="M1.5 6.4 L4.6 9.4 L10.5 2.8"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: ease.standard }}
          />
        </svg>
      </span>
    </button>
  );
}

/** Judul yang dicoret dengan sapuan kiri→kanan 240ms (§7.4 langkah 2). */
export function StrikeText({
  done,
  children,
  className = "",
}: {
  done: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <span className={`relative inline-block ${className}`}>
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 h-px w-full origin-left bg-current"
        initial={false}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.24, ease: ease.standard, delay: done ? dur.fast : 0 }}
      />
    </span>
  );
}
