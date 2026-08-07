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
 * Indikator sync (§5.1 #6).
 *
 * Sengaja DIAM saat semuanya aman: status "tersimpan" itu keadaan normal, dan
 * nempelin label permanen buat keadaan normal cuma nambah keramaian di header.
 * Dia baru muncul kalau ada yang perlu diketahui — nyimpen, offline, konflik.
 */
export function SyncBadge() {
  const outbox = useKaiStore((s) => s.outbox);
  const online = useKaiStore((s) => s.online);

  if (!supabaseConfigured) return null;

  const { status, count } = syncIndicator(outbox, online);
  if (status === "synced") return null;

  const accent = status === "conflict";

  return (
    <span
      className={`t-num inline-flex items-center gap-1.5 ${accent ? "text-accent" : "text-ink70"}`}
      title={count > 0 ? `${count} perubahan menunggu` : undefined}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          accent ? "bg-accent" : "bg-ink70"
        } ${status === "pending" ? "animate-pulse" : ""}`}
      />
      {LABEL[status]}
      {count > 0 && status !== "conflict" ? ` ${count}` : ""}
    </span>
  );
}
