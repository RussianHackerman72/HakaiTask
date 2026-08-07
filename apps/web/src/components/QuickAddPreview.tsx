import { motion } from "framer-motion";
import type { MatchedRange, ParseResult } from "@hakaitask/core";
import { clock, durationLabel, headerDate, whenLabel } from "../lib/format.js";
import { normalTransition } from "../lib/motion.js";

export const QUICK_ADD_CONTOH = [
  "ingetin gw bsk jam 2 ada rapat sama klien",
  "revisi video vlog penting besok jam 2 siang",
  "tiap senin jam 8 standup",
];

export function QuickAddExamples({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div>
      <p className="t-meta text-ink40">Coba tulis</p>
      <ul className="mt-2 space-y-1">
        {QUICK_ADD_CONTOH.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="text-left text-[15px] font-medium text-ink70 transition-colors duration-[var(--dur-fast)] hover:text-ink"
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
export function QuickAddPreview({
  parsed,
  value,
  now,
}: {
  parsed: ParseResult;
  value: string;
  now: Date;
}) {
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
      <QuickAddHighlighted value={value} matched={parsed.matched} />

      <p className="mt-3 text-[16px] font-semibold leading-6 text-ink">
        {parsed.title || <span className="font-normal text-ink40">(judul kosong)</span>}
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
              className={chip.accent ? "chip-active !bg-accent" : "chip"}
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
export function QuickAddHighlighted({
  value,
  matched,
}: {
  value: string;
  matched: MatchedRange[];
}) {
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
        className="rounded-[3px] bg-subtle px-0.5 text-ink70"
      >
        {value.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));

  return <p className="t-mono break-words text-ink40">{parts}</p>;
}
