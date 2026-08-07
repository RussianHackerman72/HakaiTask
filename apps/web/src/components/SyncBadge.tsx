import { motion } from "framer-motion";
import { syncIndicator } from "@hakaitask/core/sync";
import { useKaiStore } from "@hakaitask/core/store";
import { supabaseConfigured } from "../lib/supabase.js";
import { press } from "../lib/motion.js";

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
  const retryDeadLetter = useKaiStore((s) => s.retryDeadLetter);

  if (!supabaseConfigured) return null;

  const { status, count } = syncIndicator(outbox, online);
  if (status === "synced") return null;

  const accent = status === "conflict";

  const dot = (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        accent ? "bg-accent" : "bg-ink70"
      } ${status === "pending" ? "animate-pulse" : ""}`}
    />
  );

  // Konflik cuma pindah balik ke antrean lokal — biar user bisa coba lagi
  // tanpa lewat DevTools kalau penyebabnya (jaringan, dsb) udah beres. Begitu
  // di-klik, statusnya sendiri yang jadi bukti: badge ini ganti jadi
  // "Menyimpan" (atau ilang) di render berikutnya, bukan label sesaat yang
  // keburu ketiban perubahan status sebelum sempat kelihatan.
  if (accent) {
    return (
      <motion.button
        type="button"
        whileTap={press}
        onClick={retryDeadLetter}
        className="t-num inline-flex cursor-pointer items-center gap-1.5 text-accent transition-opacity duration-[var(--dur-fast)] hover:opacity-70"
        title={`${count} perubahan gagal terkirim — klik buat coba lagi`}
      >
        {dot}
        {LABEL[status]}
      </motion.button>
    );
  }

  return (
    <span
      className="t-num inline-flex items-center gap-1.5 text-ink70"
      title={count > 0 ? `${count} perubahan menunggu` : undefined}
    >
      {dot}
      {LABEL[status]}
      {count > 0 ? ` ${count}` : ""}
    </span>
  );
}
