/**
 * Worker sinkronisasi — PLAN.md §6.8
 *
 * Alurnya satu arah dan membosankan on purpose:
 *   mutasi lokal → outbox → drain satu-satu ke Supabase → ack
 *   perubahan remote → merge ke store
 *
 * Gak ada yang nunggu jaringan di jalur UI. Kalau offline, outbox numpuk dan
 * drain-nya lanjut sendiri begitu online.
 *
 * Dulu file ini cuma ngurus tabel `tasks`. Sejak keputusan P1 (PLAN-CHAT),
 * jadwal dan kamus pribadi ikut sync — jadi tabelnya dideskripsikan sebagai
 * data, bukan ditulis sebagai tiga cabang if yang gampang beda-beda perilaku.
 */
import { backoffMs, type EntityKind, type Mutation } from "@hakaitask/core/sync";
import { useKaiStore } from "@hakaitask/core/store";
import { supabase } from "./supabase.js";
import {
  blockFromRow,
  blockToRow,
  fromRow,
  lexiconFromRow,
  lexiconToRow,
  toRow,
  type TaskRow,
} from "./mapping.js";

const LAST_PULL_PREFIX = "hakaitask-last-pull";
const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Satu entitas yang disinkronkan. `snapshot` sengaja baca dari store, bukan
 * dari payload mutasi: mutasi "update" cuma bawa field yang berubah, dan
 * upsert dari potongan itu bakal bikin baris baru tanpa kolom wajib kalau
 * baris aslinya belum pernah nyampe server.
 */
interface EntitySync {
  table: string;
  snapshot: (id: string) => TaskRow | null;
  merge: (row: TaskRow, at: string) => void;
}

const ENTITIES: Partial<Record<EntityKind, EntitySync>> = {
  task: {
    table: "tasks",
    snapshot: (id) => {
      const t = useKaiStore.getState().tasks[id];
      return t ? toRow(t) : null;
    },
    merge: (row, at) => useKaiStore.getState().mergeRemoteTask(fromRow(row), at),
  },
  busy_block: {
    table: "busy_blocks",
    snapshot: (id) => {
      const b = useKaiStore.getState().busyBlocks[id];
      return b ? blockToRow(b) : null;
    },
    merge: (row) => useKaiStore.getState().mergeRemoteBlock(blockFromRow(row)),
  },
  lexicon: {
    table: "user_lexicon",
    snapshot: (id) => {
      const e = useKaiStore.getState().lexicon[id];
      return e ? lexiconToRow(e) : null;
    },
    merge: (row) => useKaiStore.getState().mergeRemoteLexicon(lexiconFromRow(row)),
  },
};

function readLastPull(table: string): string {
  return localStorage.getItem(`${LAST_PULL_PREFIX}:${table}`) ?? EPOCH;
}

function writeLastPull(table: string, iso: string): void {
  localStorage.setItem(`${LAST_PULL_PREFIX}:${table}`, iso);
}

async function push(mutation: Mutation, userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi");

  const spec = ENTITIES[mutation.entity];
  // Entitas yang belum disinkronkan (project, settings, focus_session) di-ack
  // diam-diam, bukan bikin antrean mampet selamanya.
  if (!spec) return;

  if (mutation.op === "delete") {
    const { error } = await supabase
      .from(spec.table)
      .update({ deleted_at: mutation.payload.deletedAt ?? new Date().toISOString() })
      .eq("id", mutation.entityId);
    if (error) throw error;
    return;
  }

  const snapshot = spec.snapshot(mutation.entityId);
  // Udah kehapus lokal sebelum sempat kekirim — gak ada yang perlu dikirim.
  if (!snapshot) return;

  const row = { ...snapshot, id: mutation.entityId, user_id: userId };
  const { error } = await supabase.from(spec.table).upsert(row, { onConflict: "id" });
  if (error) throw error;
}

async function pullTable(spec: EntitySync, userId: string): Promise<void> {
  if (!supabase) return;
  const since = readLastPull(spec.table);
  const { data, error } = await supabase
    .from(spec.table)
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", since)
    .order("updated_at", { ascending: true });

  if (error) throw error;
  if (!data) return;

  for (const row of data as TaskRow[]) {
    const at = String(row.updated_at ?? new Date().toISOString());
    spec.merge(row, at);
    writeLastPull(spec.table, at);
  }
}

async function pull(userId: string): Promise<void> {
  for (const spec of Object.values(ENTITIES)) {
    if (spec) await pullTable(spec, userId);
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

  const channels = Object.values(ENTITIES)
    .filter((s): s is EntitySync => s !== undefined)
    .map((spec) =>
      supabase
        ?.channel(`${spec.table}:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: spec.table, filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as TaskRow | null;
            if (!row?.id) return;
            const at = String(row.updated_at ?? new Date().toISOString());
            spec.merge(row, at);
            writeLastPull(spec.table, at);
          },
        )
        .subscribe(),
    );

  void kick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    for (const ch of channels) if (ch) void supabase?.removeChannel(ch);
  };
}
