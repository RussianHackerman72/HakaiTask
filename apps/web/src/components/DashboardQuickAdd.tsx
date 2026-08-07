import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { parseQuickAdd, type ParseResult } from "@hakaitask/core";
import { press, rise } from "../lib/motion.js";
import { createFromParse } from "../lib/tasks.js";
import { QuickAddExamples, QuickAddPreview } from "./QuickAddPreview.js";

/**
 * Ketikan langsung di dashboard — gak perlu buka apa-apa. Tombol `+` /
 * Ctrl+K masih ada buat yang lebih suka overlay, tapi ini yang utama.
 */
export function DashboardQuickAdd({
  now,
  userId,
  forcedDate,
  placeholder,
}: {
  now: Date;
  userId: string;
  /** Kalau diisi (mis. dari halaman kalender), task tanpa tanggal eksplisit jatuh ke tanggal ini. */
  forcedDate?: Date;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const parsed = useMemo<ParseResult | null>(
    () => (value.trim() ? parseQuickAdd(value, { now }) : null),
    [value, now],
  );

  function submit(): void {
    if (!parsed || !parsed.title.trim()) return;
    const final =
      forcedDate && !parsed.dueAt && !parsed.startAt
        ? { ...parsed, dueAt: forcedDate, allDay: true }
        : parsed;
    createFromParse(final, userId);
    setValue("");
  }

  const showPanel = focused || value.trim().length > 0;

  return (
    <motion.div variants={rise} initial="hidden" animate="show" className="card">
      <div className="flex items-center gap-3 px-5 py-4">
        <span aria-hidden className="t-num text-ink40">
          +
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? "Tulis task apa aja — “bsk jam 2 rapat klien”"}
          className="w-full bg-transparent text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink40"
          autoComplete="off"
          spellCheck={false}
        />
        {parsed?.title.trim() && (
          <motion.button
            type="button"
            whileTap={press}
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            className="btn-pill shrink-0 py-2 text-[13px]"
          >
            Simpan
          </motion.button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-line"
          >
            <div className="px-5 py-4">
              {parsed ? (
                <QuickAddPreview parsed={parsed} value={value} now={now} />
              ) : (
                <QuickAddExamples onPick={setValue} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
