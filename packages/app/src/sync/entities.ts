/**
 * Tabel yang disinkronkan, dideskripsikan sebagai DATA — bukan tiga cabang if
 * yang gampang beda-beda perilaku (keputusan P1, PLAN-CHAT).
 */
import { useKaiStore } from "@hakaitask/core/store";
import type { EntityKind } from "@hakaitask/core/sync";
import {
  blockFromRow,
  blockToRow,
  fromRow,
  lexiconFromRow,
  focusFromRow,
  focusToRow,
  lexiconToRow,
  toRow,
  type TaskRow,
} from "../mapping.js";

/**
 * `snapshot` sengaja baca dari store, bukan dari payload mutasi: mutasi
 * "update" cuma bawa field yang berubah, dan upsert dari potongan itu bakal
 * bikin baris baru tanpa kolom wajib kalau baris aslinya belum pernah nyampe
 * server.
 */
export interface EntitySync {
  table: string;
  snapshot: (id: string) => TaskRow | null;
  merge: (row: TaskRow, at: string) => void;
}

export const ENTITIES: Partial<Record<EntityKind, EntitySync>> = {
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
  focus_session: {
    table: "focus_sessions",
    snapshot: (id) => {
      const f = useKaiStore.getState().focusSessions[id];
      return f ? focusToRow(f) : null;
    },
    merge: (row) => {
      const s = focusFromRow(row);
      useKaiStore.getState().mergeRemoteFocusSession(s);
      // Sesi baru dari device lain ngubah total menit task-nya.
      if (s.taskId) useKaiStore.getState().recomputeActualMin(s.taskId);
    },
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

export function entityList(): EntitySync[] {
  return Object.values(ENTITIES).filter((s): s is EntitySync => s !== undefined);
}
