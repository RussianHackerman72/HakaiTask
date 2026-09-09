/**
 * Papan kanban — kolom, urutan, dan aritmatika pindahnya.
 *
 * Semuanya MURNI dan gak kenal React: web sama mobile nggambar papannya
 * sendiri-sendiri (dua sistem gaya yang beda jauh), tapi jawaban atas "kartu
 * ini masuk kolom mana, di urutan ke berapa, dan angka apa yang harus ditulis
 * kalau digeser ke sini" cuma boleh ada satu. Dua salinan aritmatika urutan
 * itu cara paling cepat bikin papan yang sama kelihatan beda di dua layar.
 */
import type { Status, Task } from "@hakaitask/core";

/** Kolom yang ditampilin. `archived` sengaja di luar papan. */
export type KanbanColumn = "todo" | "doing" | "done";

export const KANBAN_COLUMNS: KanbanColumn[] = ["todo", "doing", "done"];

export const KANBAN_LABEL: Record<KanbanColumn, string> = {
  todo: "Belum",
  doing: "Lagi jalan",
  done: "Kelar",
};

/**
 * Jarak antar kartu waktu papannya pertama kali dikasih nomor.
 *
 * Gede supaya banyak ruang buat nyelip di antaranya tanpa langsung mepet ke
 * batas ketelitian pecahan.
 */
const LANGKAH = 1024;

/**
 * Di bawah ini dua tetangga dianggap terlalu mepet buat diselipin.
 *
 * `number` itu float 64-bit: tengah-tengah dua angka yang bedanya udah sangat
 * kecil bakal dibulatin balik ke salah satu tetangganya, dan kartunya
 * "pindah" tanpa berpindah. Ini yang bikin bug itu ketahuan sebagai
 * kebutuhan nomor ulang, bukan sebagai kartu yang diem aja pas digeser.
 */
const TERLALU_MEPET = 1e-6;

function alive(t: Task): boolean {
  return !t.deletedAt && t.status !== "archived";
}

/**
 * Urutan bawaan buat kartu yang BELUM pernah diurutin tangan: prioritas dulu,
 * lalu tenggat paling deket, lalu judul biar stabil.
 *
 * Judul dipakai sebagai pemutus terakhir, bukan `id`: id itu uuid acak, jadi
 * dua kartu yang sama-sama tanpa tenggat bakal ketuker urutannya tiap kali
 * dibikin ulang, dan itu kelihatan kayak papan yang gak bisa diem.
 */
function bandingBawaan(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ta = a.dueAt ? Date.parse(a.dueAt) : Infinity;
  const tb = b.dueAt ? Date.parse(b.dueAt) : Infinity;
  if (ta !== tb) return ta - tb;
  return a.title.localeCompare(b.title);
}

/**
 * Kartu satu kolom, urut.
 *
 * Yang udah punya `order` selalu di ATAS yang belum: begitu user mulai
 * ngatur sendiri, hasil aturannya harus kelihatan di puncak kolom, bukan
 * kecampur sama kartu yang masih ikut urutan bawaan.
 */
export function columnTasks(tasks: readonly Task[], col: KanbanColumn): Task[] {
  return tasks
    .filter((t) => alive(t) && t.status === col)
    .sort((a, b) => {
      const oa = a.order;
      const ob = b.order;
      if (oa !== undefined && ob !== undefined) return oa - ob;
      if (oa !== undefined) return -1;
      if (ob !== undefined) return 1;
      return bandingBawaan(a, b);
    });
}

export function board(tasks: readonly Task[]): Record<KanbanColumn, Task[]> {
  return {
    todo: columnTasks(tasks, "todo"),
    doing: columnTasks(tasks, "doing"),
    done: columnTasks(tasks, "done"),
  };
}

export type RankResult =
  | { ok: true; order: number }
  /** Celahnya abis. Pemanggil harus nomorin ulang kolomnya, lalu coba lagi. */
  | { ok: false; reason: "renumber" };

/**
 * Angka urut buat kartu yang mendarat DI ANTARA `sebelum` dan `sesudah`.
 *
 * Dua-duanya `undefined` = kolomnya kosong. Salah satunya `undefined` =
 * mendarat di ujung.
 */
export function rankBetween(sebelum?: number, sesudah?: number): RankResult {
  if (sebelum === undefined && sesudah === undefined) return { ok: true, order: 0 };
  if (sebelum === undefined) return { ok: true, order: sesudah! - LANGKAH };
  if (sesudah === undefined) return { ok: true, order: sebelum + LANGKAH };

  if (sesudah - sebelum < TERLALU_MEPET) return { ok: false, reason: "renumber" };
  return { ok: true, order: (sebelum + sesudah) / 2 };
}

/**
 * Nomor urut baru buat SELURUH kolom, dipakai kalau celahnya abis.
 *
 * Jarang kejadian — butuh sekitar 50 kali nyelip di antara dua kartu yang
 * sama. Tapi kalau kejadian dan gak ditangani, kartunya keliatan gak bisa
 * digeser sama sekali, dan itu jenis rusak yang bikin orang berhenti nyoba.
 */
export function renumber(kolom: readonly Task[]): { id: string; order: number }[] {
  return kolom.map((t, i) => ({ id: t.id, order: i * LANGKAH }));
}

export interface MovePlan {
  /** Kolom tujuan; sama kayak asalnya kalau cuma diurut ulang. */
  status: Status;
  order: number;
  /** Kalau keisi, tulis ini DULU sebelum `order` di atas dipakai. */
  renumber?: { id: string; order: number }[];
}

/**
 * Rencana pindah satu kartu ke `col`, di posisi `index`.
 *
 * Balikin RENCANA, bukan langsung nulis ke store: dengan begitu aritmatikanya
 * bisa diuji tanpa store sama sekali, dan pemanggilnya (web & mobile) tinggal
 * nerapin hasil yang sama persis.
 */
export function planMove(
  tasks: readonly Task[],
  taskId: string,
  col: KanbanColumn,
  index: number,
): MovePlan | null {
  const isi = columnTasks(tasks, col).filter((t) => t.id !== taskId);
  const batas = Math.max(0, Math.min(index, isi.length));

  const sebelum = isi[batas - 1]?.order;
  const sesudah = isi[batas]?.order;

  const r = rankBetween(sebelum, sesudah);
  if (r.ok) return { status: col, order: r.order };

  /**
   * Celah abis: kolomnya dinomorin ulang DULU, baru posisinya dihitung lagi
   * di atas angka yang baru. Dihitung di sini, bukan dilempar ke pemanggil,
   * biar gak ada dua tempat yang perlu tau soal kasus ini.
   */
  const nomorBaru = renumber(isi);
  const sebelum2 = nomorBaru[batas - 1]?.order;
  const sesudah2 = nomorBaru[batas]?.order;
  const r2 = rankBetween(sebelum2, sesudah2);
  if (!r2.ok) return null; // gak mungkin sampai sini; jangan nebak.

  return { status: col, order: r2.order, renumber: nomorBaru };
}
