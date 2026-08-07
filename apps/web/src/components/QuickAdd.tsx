import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { parseQuickAdd, type ParseResult } from "@hakaitask/core";
import { fade, press, rise } from "../lib/motion.js";
import { useAutoFocus, useEscape, useScrollLock } from "../lib/hooks.js";
import { createFromParse } from "../lib/tasks.js";
import { QuickAddExamples, QuickAddPreview } from "./QuickAddPreview.js";

export function QuickAdd({
  open,
  now,
  userId,
  onClose,
  initialValue = "",
}: {
  open: boolean;
  now: Date;
  userId: string;
  onClose: () => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useAutoFocus<HTMLInputElement>(open);

  // Isi ulang tiap kali dibuka — command palette bisa ngoper teks awal.
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  useScrollLock(open);
  useEscape(open, onClose);

  const parsed = useMemo<ParseResult | null>(
    () => (value.trim() ? parseQuickAdd(value, { now }) : null),
    [value, now],
  );

  function submit(): void {
    if (!parsed || !parsed.title.trim()) return;
    createFromParse(parsed, userId);
    setValue("");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="quick-add"
          variants={fade}
          initial="hidden"
          animate="show"
          exit="exit"
          className="fixed inset-0 z-50 flex items-start justify-center bg-paper/80 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* Tanpa initial/animate/exit sendiri: label variant diwarisin dari
              overlay, jadi AnimatePresence cuma nunggu satu animasi keluar. */}
          <motion.div
            variants={rise}
            role="dialog"
            aria-modal="true"
            aria-label="Tambah cepat"
            className="card w-full max-w-[var(--max-content)] overflow-hidden"
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Tulis apa aja"
              aria-label="Tulis task baru"
              className="w-full bg-transparent px-5 py-5 text-[20px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink40"
              autoComplete="off"
              spellCheck={false}
            />

            <div className="border-t border-line px-5 py-4">
              {parsed ? (
                <QuickAddPreview parsed={parsed} value={value} now={now} />
              ) : (
                <QuickAddExamples onPick={setValue} />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="t-num text-ink40">Enter buat simpan · Esc buat batal</span>
              <motion.button
                type="button"
                whileTap={press}
                onClick={submit}
                disabled={!parsed?.title.trim()}
                className="btn-pill py-2 disabled:opacity-40"
              >
                Simpan
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
