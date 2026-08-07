/**
 * Worker sinkronisasi — PLAN.md §6.8.
 *
 * Alurnya satu arah dan membosankan on purpose:
 *   mutasi lokal → outbox → drain satu-satu ke Supabase → ack
 *   perubahan remote → merge LWW per field ke store
 *
 * Gak ada yang nunggu jaringan di jalur UI. Kalau offline, outbox numpuk
 * dan drain-nya lanjut sendiri begitu online.
 */
import { backoffMs, type Mutation } from "@hakaitask/core/sync";
import { useKaiStore } from "@hakaitask/core/store";
import { supabase } from "./supabase.js";
import { fromRow, toRow, type TaskRow } from "./mapping.js";

const LAST_PULL_KEY = "hakaitask-last-pull";

function readLastPull(): string {
  return localStorage.getItem(LAST_PULL_KEY) ?? "1970-01-01T00:00:00.000Z";
}

function writeLastPull(iso: string): void {
  localStorage.setItem(LAST_PULL_KEY, iso);
}

async function push(mutation: Mutation, userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi");

  if (mutation.op === "delete") {
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: mutation.payload.deletedAt ?? new Date().toISOString() })
      .eq("id", mutation.entityId);
    if (error) throw error;
    return;
  }

  // Upsert, bukan insert-atau-update terpisah: bikin mutasi aman diulang
  // kalau responsnya hilang di tengah jalan (at-least-once delivery).
  //
  // Kirim SNAPSHOT task saat ini, bukan cuma payload/patch mutasinya: kalau
  // mutasi "create" entitas ini gagal duluan (mati di outbox) dan baru
  // "update" yang sampai server, upsert dari patch doang bakal coba insert
  // baris baru tanpa kolom wajib (mis. title) — selalu ditolak NOT NULL,
  // gagal-retry selamanya. Snapshot penuh selalu punya semua kolom wajib.
  const task = useKaiStore.getState().tasks[mutation.entityId];
  if (!task) return;
  const row = { ...toRow(task), id: mutation.entityId, user_id: userId };
  const { error } = await supabase.from("tasks").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

async function pull(userId: string): Promise<void> {
  if (!supabase) return;
  const since = readLastPull();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", since)
    .order("updated_at", { ascending: true });

  if (error) throw error;
  if (!data) return;

  const { mergeRemoteTask } = useKaiStore.getState();
  for (const row of data as TaskRow[]) {
    const at = String(row.updated_at ?? new Date().toISOString());
    mergeRemoteTask(fromRow(row), at);
    writeLastPull(at);
  }
}

/**
 * Nyalain sync buat satu user. Balikin fungsi buat matiin (dipanggil saat
 * logout atau unmount) — semua timer, listener, dan channel ikut dibersihin.
 */
export function startSync(userId: string): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let draining = false;

  const setOnline = (v: boolean) => useKaiStore.getState().setOnline(v);
  const onOnline = () => {
    setOnline(true);
    void kick();
  };
  const onOffline = () => setOnline(false);

  async function drain(): Promise<void> {
    if (stopped || draining) return;
    draining = true;
    try {
      for (;;) {
        const state = useKaiStore.getState();
        if (stopped || !state.online) break;
        const head = state.outbox.queue[0];
        if (!head) break;

        try {
          await push(head, userId);
          useKaiStore.getState().ackMutation(head.id);
        } catch (err) {
          useKaiStore.getState().failMutation(head.id);
          // Antre ulang di belakang backoff. Kalau errornya jaringan,
          // `online` bakal false duluan dan loop berhenti sendiri.
          schedule(backoffMs(head.attempts));
          if (import.meta.env.DEV) console.warn("[sync] gagal kirim", err);
          break;
        }
      }
    } finally {
      draining = false;
    }
  }

  function schedule(ms: number): void {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void kick(), ms);
  }

  async function kick(): Promise<void> {
    if (stopped || !supabase) return;
    try {
      await pull(userId);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[sync] gagal tarik", err);
    }
    await drain();
  }

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  setOnline(navigator.onLine);

  // Antrean baru dari UI langsung memicu drain, tanpa polling.
  const unsubscribe = useKaiStore.subscribe((s, prev) => {
    if (s.outbox.queue.length > prev.outbox.queue.length) void drain();
  });

  const channel = supabase
    ?.channel(`tasks:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as TaskRow | null;
        if (!row?.id) return;
        const at = String(row.updated_at ?? new Date().toISOString());
        useKaiStore.getState().mergeRemoteTask(fromRow(row), at);
        writeLastPull(at);
      },
    )
    .subscribe();

  void kick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    if (channel) void supabase?.removeChannel(channel);
  };
}
