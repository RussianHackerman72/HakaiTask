import { syncIndicator } from "@hakaitask/core/sync";
import { useKaiStore } from "@hakaitask/core/store";
import { supabaseConfigured } from "../lib/supabase.js";

const LABEL = {
  synced: "Tersimpan",
  pending: "Menyimpan",
  offline: "Offline",
  conflict: "Perlu dicek",
} as const;

/**
 * Indikator sync (§5.1 #6). Titik kecil di header — cukup buat bilang
 * "aman kok", tanpa jadi spinner yang bikin cemas.
 */
export function SyncBadge() {
  const outbox = useKaiStore((s) => s.outbox);
  const online = useKaiStore((s) => s.online);

  if (!supabaseConfigured) {
    return <span className="t-mono text-ink40">lokal</span>;
  }

  const { status, count } = syncIndicator(outbox, online);
  const accent = status === "conflict";

  return (
    <span
      className="t-mono inline-flex items-center gap-1.5 text-ink40"
      title={count > 0 ? `${count} perubahan menunggu` : undefined}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          accent ? "bg-accent" : status === "synced" ? "bg-ink40" : "bg-ink70"
        } ${status === "pending" ? "animate-pulse" : ""}`}
      />
      {LABEL[status]}
      {count > 0 && status !== "conflict" ? ` ${count}` : ""}
    </span>
  );
}
