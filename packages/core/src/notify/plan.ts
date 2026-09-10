/**
 * Kebijakan notifikasi — PLAN.md §6.7
 *
 * Dilanggar sekali, notifikasi bakal dimatiin selamanya sama user. Jadi
 * aturannya ditaruh di sini, sebagai fungsi MURNI yang bisa diuji tanpa
 * mocking sama sekali — bukan disebar jadi if-if di lapisan Android.
 *
 * Lapisan app tinggal jadi tukang rekonsiliasi: minta rencana, bandingin sama
 * yang udah terjadwal lewat `key`, batalin yang hilang, jadwalin yang baru.
 * Karena `key`-nya stabil dan idempoten, ngejalanin ini sepuluh kali berturut
 * hasilnya sama persis kayak sekali.
 */
import type { ISODate, Task, UserSettings } from "../types.js";

export type NotifKind = "due" | "brief" | "overdue" | "review" | "summary";

export interface PlannedNotification {
  /** Stabil & idempoten: "due:<taskId>", "brief:2026-09-05". */
  key: string;
  kind: NotifKind;
  at: ISODate;
  title: string;
  body: string;
  /** Tiap notif nunjuk ke SESUATU — §6.7 aturan 3, gak ada yang mendarat di halaman depan. */
  data: { taskId?: string };
  /**
   * Kebal dari batas harian (`maxNotifPerDay`).
   *
   * Cuma buat pengingat yang disetel TANGAN di task tertentu. Batas harian
   * itu buat notifikasi yang gak diminta — brief, tertunggak, review. Kalau
   * user niat nyetel "ingetin tiap 2 jam" terus diem-diem cuma dikasih 4,
   * yang rusak bukan cuma fiturnya, tapi kepercayaan bahwa setelan di app
   * ini beneran ngaruh.
   */
  exempt?: boolean;
}

const MIN = 60_000;
const DAY = 86_400_000;

/**
 * Jarak aman buat pengingat yang dimajuin ke "sekarang". Bukan 0: notifikasi
 * yang bunyi di detik yang sama pas user ngetik task-nya kebaca kayak error,
 * bukan pengingat.
 */
const SOON = 60_000;

function hhmm(s: string | undefined, fallback: [number, number]): [number, number] {
  const m = s?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return [Number(m[1]), Number(m[2])];
}

function atTime(day: Date, [h, m]: [number, number]): Date {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Jam tenang 22:00–06:00 (§6.7 aturan 2) — rentangnya NGELEWATIN tengah malam,
 * jadi perbandingannya OR, bukan AND. Ditulis kebalik, jam 23:00 lolos dan
 * jam 12 siang malah diblokir.
 */
export function inQuietHours(d: Date, quiet: readonly [string, string]): boolean {
  const [sh, sm] = hhmm(quiet[0], [22, 0]);
  const [eh, em] = hhmm(quiet[1], [6, 0]);
  const mins = d.getHours() * 60 + d.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start > end ? mins >= start || mins < end : mins >= start && mins < end;
}

/** Ujung jam tenang berikutnya sesudah `d`. */
function quietEndsAfter(d: Date, quiet: readonly [string, string]): Date {
  const [eh, em] = hhmm(quiet[1], [6, 0]);
  const out = atTime(d, [eh, em]);
  if (out.getTime() <= d.getTime()) out.setTime(out.getTime() + DAY);
  return out;
}

/** Awal jam tenang yang MEMBUNGKUS `d` — kebalikan `quietEndsAfter`. */
function quietStartsBefore(d: Date, quiet: readonly [string, string]): Date {
  const [sh, sm] = hhmm(quiet[0], [22, 0]);
  const out = atTime(d, [sh, sm]);
  if (out.getTime() > d.getTime()) out.setTime(out.getTime() - DAY);
  return out;
}

function alive(t: Task): boolean {
  return !t.deletedAt && t.status !== "done" && t.status !== "archived";
}

/**
 * Batas pengingat yang boleh dihasilkan SATU task.
 *
 * Android punya plafon alarm per app (~500). Tanpa batas per task, satu
 * "tiap 5 menit selama 30 hari" = 8.640 alarm, dan yang jebol bukan cuma
 * task itu — SEMUA notifikasi app ikut mati. Yang kepotong selalu yang
 * paling jauh dari tenggat, karena itu yang paling sedikit isinya.
 */
const MAX_PER_TASK = 64;

/** Task ini punya jadwal pengingat yang disetel TANGAN, bukan bawaan? */
function isExplicit(t: Task): boolean {
  const r = t.reminders;
  return !!(r && ((r.leads && r.leads.length > 0) || r.repeat));
}

/**
 * Satu-satunya tempat yang tau urutan menang antara `reminders`, `reminderMin`,
 * dan `settings.defaultReminderMin`. Hasilnya menit-sebelum-tenggat, urut dari
 * yang PALING DEKAT tenggat.
 *
 * Urutan itu bukan kosmetik: dia yang bikin pemotongan di `MAX_PER_TASK`
 * ngebuang yang paling jauh, bukan yang paling penting.
 */
export function resolveLeads(t: Task, settings: UserSettings): number[] {
  const r = t.reminders;
  const out = new Set<number>();

  for (const m of r?.leads ?? []) {
    if (Number.isFinite(m) && m > 0) out.add(Math.round(m));
  }

  const rep = r?.repeat;
  // `everyMin > 0` bukan basa-basi: 0 atau negatif bikin loop-nya gak berhenti.
  if (rep && rep.everyMin > 0 && rep.startMin > 0) {
    // Dari yang paling DEKAT tenggat merambat keluar, jadi kalau kena batas
    // yang ilang adalah ujung terjauh.
    for (let m = rep.everyMin; m <= rep.startMin; m += rep.everyMin) {
      out.add(Math.round(m));
      if (out.size >= MAX_PER_TASK) break;
    }
  }

  if (out.size === 0) out.add(t.reminderMin ?? settings.defaultReminderMin);

  return [...out].sort((a, b) => a - b).slice(0, MAX_PER_TASK);
}

export interface PlanInput {
  now: Date;
  tasks: readonly Task[];
  settings: UserSettings;
  /**
   * Android punya batas jumlah alarm terjadwal, jadi cuma 7 hari ke depan
   * (§6.7). Sisanya dijadwalin ulang tiap app dibuka.
   */
  horizonDays?: number;
  /**
   * Cakrawala khusus pengingat yang disetel tangan di task. Lebih jauh karena
   * jumlahnya sedikit — dan karena "ingetin seminggu sebelum" gak ada gunanya
   * kalau baru kepasang pas app-nya kebuka.
   */
  taskHorizonDays?: number;
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const { now, tasks, settings } = input;
  const horizon = now.getTime() + (input.horizonDays ?? 7) * DAY;
  const taskHorizon = now.getTime() + (input.taskHorizonDays ?? 30) * DAY;
  const quiet = settings.quietHours;
  const out: PlannedNotification[] = [];

  // ── pengingat tenggat ─────────────────────────────────────────────────────
  for (const t of tasks) {
    if (!alive(t) || !t.dueAt) continue;
    const due = new Date(t.dueAt);

    // Tenggatnya sendiri udah lewat → itu urusan ringkasan tertunggak, bukan
    // pengingat. Dulu ini kegabung sama cek di bawah, dan itu yang bikin bug.
    if (due.getTime() <= now.getTime()) continue;

    const leads = resolveLeads(t, settings);
    const explicit = isExplicit(t);
    /**
     * Jadwal yang disetel tangan dapat cakrawala 30 hari; sisanya tetap 7.
     *
     * Cakrawala 7 hari itu ada karena brief & review beranak tiap hari. Tapi
     * pengingat "seminggu sebelum" buat tenggat tiga minggu lagi jatuh di hari
     * ke-14 — di luar 7 hari, jadi baru kepasang kalau app-nya kebuka. Padahal
     * orang yang perlu diingetin seminggu sebelumnya justru orang yang lagi
     * gak buka app-nya. Pengingat setelan tangan itu jarang, jadi 30 hari cuma
     * nambah segelintir alarm.
     */
    const bound = explicit ? taskHorizon : horizon;
    const multi = leads.length > 1;

    const ticks: { lead: number; at: Date }[] = [];

    for (const lead of leads) {
      let at = new Date(due.getTime() - lead * MIN);

      if (at.getTime() <= now.getTime()) continue; // udah lewat — diurus di bawah
      if (at.getTime() > bound) continue;

      /**
       * Kalau pengingatnya jatuh di jam tenang, digeser ke ujung jam tenang —
       * TAPI cuma kalau tenggatnya belum lewat waktu itu. Pengingat yang nongol
       * sesudah deadline itu bukan pengingat, itu sindiran.
       *
       * Kalau digesernya kelewat, dulu notifnya dibuang gitu aja. Sekarang
       * ditarik MUNDUR ke sesaat sebelum jam tenang mulai: tenggat jam 02:00
       * dini hari mestinya diingetin jam 21:59, waktu orangnya masih melek.
       *
       * Yang punya BANYAK pengingat beda: digeser semua ke ujung jam tenang
       * artinya delapan notifikasi numpuk di jam 06:00 sekaligus. Buat deret,
       * tick yang jatuh di jam tenang DIBUANG, bukan digeser — masih ada tick
       * lain yang bakal bunyi di jam wajar.
       */
      if (inQuietHours(at, quiet)) {
        if (multi) continue;
        const maju = quietEndsAfter(at, quiet);
        if (maju.getTime() < due.getTime()) {
          at = maju;
        } else {
          const mundur = new Date(quietStartsBefore(at, quiet).getTime() - SOON);
          if (mundur.getTime() <= now.getTime()) continue;
          at = mundur;
        }
      }

      ticks.push({ lead, at });
    }

    /**
     * Pengingat yang jam tayangnya UDAH LEWAT tapi tenggatnya belum: dimajuin
     * ke sekarang, jangan dibuang.
     *
     * Ini bug paling mahal di lapisan notifikasi. Dulu barisnya satu:
     * `if (at <= now || at > horizon) continue`. Task yang dibikin lewat chat
     * hampir selalu tenggatnya deket — "meeting jam 3" dibikin jam 2 lewat,
     * lead bawaannya 60 menit, jadi `at` mundur ke jam 2 kurang dan LANGSUNG
     * kebuang. Pengingatnya gak telat, gak salah jam: gak pernah ada.
     *
     * Syaratnya `nearest` HARUS udah lewat. Tanpa itu, task yang cuma kejauhan
     * dari cakrawala ikut kena dan malah bunyi sekarang juga.
     */
    const nearest = new Date(due.getTime() - leads[0]! * MIN);
    if (ticks.length === 0 && nearest.getTime() <= now.getTime()) {
      /**
       * Dijangkar ke `updatedAt`, BUKAN ke `now`. Ini yang bikin badai.
       *
       * Kuncinya (`due:<id>:<lead>`) emang tetap, tapi notifikasi yang UDAH
       * BUNYI ilang dari daftar terjadwal. Jadi rekonsiliasi berikutnya lihat
       * kuncinya kosong, ngitung `now + SOON` yang BARU, dan masang lagi.
       * Terus begitu tiap kali app kebuka atau task kesentuh, sampai
       * tenggatnya lewat — 24 notifikasi dalam setengah jam, dari satu task.
       * `capPerDay` gak nolong: dia cuma ngatur brief, overdue, sama review;
       * `due` gak pernah kena batas.
       *
       * Jangkar ke `updatedAt` bikin jamnya TETAP: sekali bunyi, hitungan
       * yang sama udah lewat, jadi ronde berikutnya gak masang apa-apa lagi.
       * Artinya juga lebih pas — "baru kamu tulis, dan jam pengingatnya udah
       * kelewat, jadi diingetin sesaat setelah kamu nulis", bukan "diingetin
       * sesaat setelah app-nya dibuka".
       */
      const jangkar = new Date(t.updatedAt).getTime();
      const at = new Date((Number.isFinite(jangkar) ? jangkar : now.getTime()) + SOON);
      if (
        at.getTime() > now.getTime() &&
        at.getTime() < due.getTime() &&
        !inQuietHours(at, quiet)
      ) {
        ticks.push({ lead: leads[0]!, at });
      }
    }

    for (const tick of ticks) {
      out.push({
        key: `due:${t.id}:${tick.lead}`,
        kind: "due",
        at: tick.at.toISOString(),
        title: t.title,
        body: `Jatuh tempo ${hourLabel(due)}.`,
        data: { taskId: t.id },
        ...(explicit ? { exempt: true } : {}),
      });
    }
  }

  // ── ringkasan tertunggak, 20:00, maks 1×/hari ────────────────────────────
  const overdue = tasks.filter(
    (t) => alive(t) && t.dueAt && new Date(t.dueAt).getTime() < now.getTime(),
  );
  if (overdue.length > 0) {
    const at = atTime(now, [20, 0]);
    if (at.getTime() > now.getTime() && !inQuietHours(at, quiet)) {
      out.push({
        key: `overdue:${dayKey(now)}`,
        kind: "overdue",
        at: at.toISOString(),
        title: `${overdue.length} tugas lewat tenggat`,
        body: overdue
          .slice(0, 3)
          .map((t) => t.title)
          .join(", "),
        data: overdue[0]?.id ? { taskId: overdue[0].id } : {},
      });
    }
  }

  // ── morning brief ────────────────────────────────────────────────────────
  if (settings.morningBriefAt) {
    const t = hhmm(settings.morningBriefAt, [7, 0]);
    for (let i = 0; i < (input.horizonDays ?? 7); i++) {
      const day = new Date(now.getTime() + i * DAY);
      const at = atTime(day, t);
      if (at.getTime() <= now.getTime() || at.getTime() > horizon) continue;

      const todays = tasks.filter(
        (x) => alive(x) && x.dueAt && sameDay(new Date(x.dueAt), day),
      );
      // Sapaan pagi yang bilang "gak ada apa-apa" itu cuma bikin bangun sia-sia.
      if (todays.length === 0) continue;

      out.push({
        key: `brief:${dayKey(day)}`,
        kind: "brief",
        at: at.toISOString(),
        title: "Selamat pagi.",
        body:
          todays.length === 1
            ? `Hari ini: ${todays[0]!.title}`
            : `Hari ini: ${todays[0]!.title} (+${todays.length - 1} lagi)`,
        data: todays[0]?.id ? { taskId: todays[0].id } : {},
      });
    }
  }

  // ── review mingguan ──────────────────────────────────────────────────────
  if (settings.weeklyReviewAt) {
    const m = settings.weeklyReviewAt.match(/^([A-Z]{3})\s+(\d{1,2}):(\d{2})$/);
    const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].indexOf(m?.[1] ?? "SUN");
    if (m && dow >= 0) {
      for (let i = 0; i < (input.horizonDays ?? 7); i++) {
        const day = new Date(now.getTime() + i * DAY);
        if (day.getDay() !== dow) continue;
        const at = atTime(day, [Number(m[2]), Number(m[3])]);
        if (at.getTime() <= now.getTime() || at.getTime() > horizon) continue;
        out.push({
          key: `review:${dayKey(day)}`,
          kind: "review",
          at: at.toISOString(),
          title: "Waktunya lihat minggu ini",
          body: "Lima menit buat nutup minggu.",
          data: {},
        });
      }
    }
  }

  /**
   * Yang kebal dipisah DULU, baru sisanya dijatah.
   *
   * Kalau digabung, pengingat setelan tangan ikut ngabisin jatah harian dan
   * malah nendang brief pagi keluar — batasnya jadi ngukur hal yang salah.
   */
  const sorted = out.sort((a, b) => a.at.localeCompare(b.at));
  const kebal = sorted.filter((n) => n.exempt);
  const dijatah = capPerDay(
    sorted.filter((n) => !n.exempt),
    settings.maxNotifPerDay,
  );

  return [...kebal, ...dijatah].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Maks N per hari (§6.7 aturan 1). Yang kelebihan GAK dibuang diam-diam —
 * dikumpulin jadi satu ringkasan, jadi user tetep tau ada sesuatu tanpa
 * HP-nya bunyi tujuh kali.
 */
function capPerDay(sorted: PlannedNotification[], max: number): PlannedNotification[] {
  if (max <= 0) return [];
  const byDay = new Map<string, PlannedNotification[]>();
  for (const n of sorted) {
    const k = dayKey(new Date(n.at));
    const arr = byDay.get(k);
    if (arr) arr.push(n);
    else byDay.set(k, [n]);
  }

  const out: PlannedNotification[] = [];
  for (const [day, list] of byDay) {
    if (list.length <= max) {
      out.push(...list);
      continue;
    }
    const keep = list.slice(0, max - 1);
    const rest = list.slice(max - 1);
    out.push(...keep);
    out.push({
      key: `summary:${day}`,
      kind: "summary",
      at: rest[0]!.at,
      title: `${rest.length} pengingat lagi`,
      body: rest
        .slice(0, 3)
        .map((n) => n.title)
        .join(", "),
      ...(rest[0]!.data.taskId ? { data: { taskId: rest[0]!.data.taskId } } : { data: {} }),
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hourLabel(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `jam ${h}.${m}`;
}
