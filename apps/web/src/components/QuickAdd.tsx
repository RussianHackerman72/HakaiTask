import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { parseQuickAdd, type MatchedRange, type ParseResult } from "@hakaitask/core";
import { clock, durationLabel, headerDate, whenLabel } from "../lib/format.js";
import { fade, normalTransition, press, rise } from "../lib/motion.js";
import { useAutoFocus, useEscape, useScrollLock } from "../lib/hooks.js";
import { createFromParse } from "../lib/tasks.js";

const CONTOH = [
  "ingetin gw bsk jam 2 ada rapat sama klien",
  "revisi video vlog !p1 besok 90m #konten",
  "tiap senin jam 8 standup",
];

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
            className="w-full max-w-[--max-content] overflow-hidden rounded-[--radius-md] border border-line bg-paper"
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
              placeholder="Tulis apa aja — “bsk jam 2 rapat klien”"
              className="w-full bg-transparent px-5 py-5 text-[20px] text-ink outline-none placeholder:text-ink40"
              autoComplete="off"
              spellCheck={false}
            />

            <div className="border-t border-line px-5 py-4">
              {parsed ? (
                <Preview parsed={parsed} value={value} now={now} />
              ) : (
                <Examples onPick={setValue} />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="t-mono text-ink40">Enter buat simpan · Esc buat batal</span>
              <motion.button
                type="button"
                whileTap={press}
                onClick={submit}
                disabled={!parsed?.title.trim()}
                className="t-meta rounded-[--radius-sm] border border-line px-3 py-1.5 text-ink transition-colors duration-[--dur-fast] hover:bg-surface disabled:opacity-40"
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

function Examples({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div>
      <p className="t-meta text-ink40">Coba tulis</p>
      <ul className="mt-2 space-y-1">
        {CONTOH.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="text-left text-[15px] text-ink70 transition-colors duration-[--dur-fast] hover:text-ink"
            >
              {c}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Preview chip (§5.1 #4): user harus bisa lihat apa yang kebaca parser
 * SEBELUM nyimpan. Kalau salah baca, dia tinggal ngetik ulang.
 */
function Preview({ parsed, value, now }: { parsed: ParseResult; value: string; now: Date }) {
  const chips: Array<{ label: string; accent?: boolean }> = [];

  if (parsed.kind === "busy") chips.push({ label: "jadwal" });

  if (parsed.dueAt ?? parsed.startAt) {
    const d = parsed.dueAt ?? parsed.startAt!;
    const label = parsed.allDay
      ? `${whenLabel(d.toISOString(), now, true)} · ${headerDate(d)}`
      : `${whenLabel(d.toISOString(), now)} · ${clock(d)}`;
    chips.push({ label: parsed.approxTime ? `± ${label}` : label });
  }

  if (parsed.priority) {
    chips.push({ label: `P${parsed.priority}`, accent: parsed.priority === 1 });
  }
  if (parsed.estimateMin !== undefined) {
    chips.push({ label: durationLabel(parsed.estimateMin)! });
  }
  if (parsed.recurrence) chips.push({ label: "berulang" });
  if (parsed.energy) chips.push({ label: `energi ${parsed.energy}` });
  if (parsed.project) chips.push({ label: `+${parsed.project}` });
  for (const tag of parsed.tags) chips.push({ label: `#${tag}` });
  if (parsed.wantsReminder) chips.push({ label: "diingetin" });

  return (
    <div>
      <Highlighted value={value} matched={parsed.matched} />

      <p className="mt-3 text-[16px] leading-6 text-ink">
        {parsed.title || <span className="text-ink40">(judul kosong)</span>}
      </p>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <motion.span
              key={chip.label}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={normalTransition}
              className={`t-mono rounded-full border px-2.5 py-1 ${
                chip.accent ? "border-accent text-accent" : "border-line text-ink70"
              }`}
            >
              {chip.label}
            </motion.span>
          ))}
        </div>
      )}

      {parsed.subtasks.length > 0 && (
        <ul className="mt-3 space-y-1">
          {parsed.subtasks.map((s, i) => (
            <li key={`${s}-${i}`} className="text-[15px] text-ink70">
              · {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sorot potongan input yang kebaca parser — bagian abu = jadi judul. */
function Highlighted({ value, matched }: { value: string; matched: MatchedRange[] }) {
  const ranges = [...matched].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const [i, r] of ranges.entries()) {
    if (r.start < cursor) continue; // rentang tumpang tindih: ambil yang pertama
    if (r.start > cursor) parts.push(value.slice(cursor, r.start));
    parts.push(
      <mark
        key={`${r.start}-${i}`}
        title={r.label}
        className="rounded-[3px] bg-surface px-0.5 text-ink70"
      >
        {value.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));

  return <p className="t-mono break-words text-ink40">{parts}</p>;
}
