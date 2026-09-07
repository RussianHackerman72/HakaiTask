/**
 * Lapisan Android buat notifikasi — sengaja BODOH.
 *
 * Semua keputusan ada di `planNotifications()` (core, murni, 23 tes). Di sini
 * cuma rekonsiliasi: minta rencana, bandingin sama yang udah terjadwal lewat
 * `key`, batalin yang hilang, jadwalin yang baru. Karena key-nya idempoten,
 * ngejalanin ini tiap app dibuka gak bikin notifikasi kembar.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { planNotifications, type PlannedNotification } from "@hakaitask/core/notify";
import type { Task, UserSettings } from "@hakaitask/core";
import { endsAt, type FocusState } from "@hakaitask/core/focus";

/** Kunci kita ditaruh di `data.key`, biar bisa dicocokin pas rekonsiliasi. */
type Scheduled = { identifier: string; key?: string };

/**
 * Channel pengingat. Versinya naik ke `-v2` karena importance channel Android
 * itu BEKU sesudah dibikin: channel `default` lama kepasang di IMPORTANCE_DEFAULT,
 * yang artinya masuk laci tanpa banner. Ngubah angkanya di kode gak ngefek
 * sedikit pun di HP yang udah kepasang — satu-satunya jalan ya channel baru.
 *
 * Ini separuh dari keluhan "notifikasinya gak muncul": dia muncul, cuma diam
 * di laci dan gak pernah kelihatan.
 */
const CH_REMINDER = "reminders-v2";
const CH_TIMER = "timer";

/**
 * Pasang handler + channel, lalu balikin status izin APA ADANYA.
 *
 * Sengaja gak mancing dialog. Dulu dialognya nongol di detik pertama app
 * dibuka, sebelum user punya satu task pun — jadi pertanyaannya gak ada
 * konteksnya, dan di Android 13+ dua kali "tolak" itu permanen. Izin yang
 * paling gampang ditolak adalah izin yang diminta sebelum jelas gunanya.
 *
 * Yang minta izin: `requestNotificationPermission()`, dipanggil pas ada
 * tenggat yang beneran perlu diingetin.
 */
export async function setupNotifications(): Promise<boolean> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    // Tanpa channel, Android 8+ diem-diem gak nampilin apa-apa.
    await Notifications.setNotificationChannelAsync(CH_REMINDER, {
      name: "Pengingat",
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(CH_TIMER, {
      name: "Timer fokus",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250],
    });
    // Channel lama disingkirin dari daftar setelan biar user gak ngatur
    // channel yang udah gak dipakai dan bingung kenapa gak ngaruh.
    await Notifications.deleteNotificationChannelAsync("default").catch(() => {});
  }

  return hasNotificationPermission();
}

/** Baca status izin TANPA mancing dialog — dipakai pas app balik ke depan. */
export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Minta izin — cuma dipanggil pas ada tenggat yang perlu diingetin, jadi
 * dialognya nongol di saat gunanya jelas.
 *
 * `canAskAgain: false` artinya user udah nolak permanen; nanya lagi cuma
 * bikin dialog yang gak muncul-muncul dan kode yang muter-muter.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.status === "granted") return true;
  if (cur.canAskAgain === false) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === "granted";
}

async function scheduledNow(): Promise<Scheduled[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.map((n) => ({
    identifier: n.identifier,
    key: (n.content.data as { key?: string } | undefined)?.key,
  }));
}

/**
 * Samain jadwal di HP sama rencana dari core. Balikin jumlah yang direncanain,
 * dibatalin, dijadwalin, dan yang GAGAL — kepake buat log, dan bikin bug
 * "kok gak muncul" jauh lebih gampang dilacak.
 *
 * `planned` juga jadi alat ukur plafon alarm Android (~500 per app): selama
 * angkanya kecil, penjatah global belum perlu dibikin.
 */
export async function syncNotifications(input: {
  tasks: readonly Task[];
  settings: UserSettings;
  now?: Date;
}): Promise<{ planned: number; cancelled: number; scheduled: number; failed: number }> {
  const plan = planNotifications({
    now: input.now ?? new Date(),
    tasks: input.tasks,
    settings: input.settings,
  });

  const wanted = new Map(plan.map((p) => [p.key, p]));
  const existing = await scheduledNow();

  let cancelled = 0;
  let failed = 0;
  const alive = new Set<string>();

  for (const s of existing) {
    // Notifikasi timer gak diurus di sini — dia punya siklus sendiri.
    if (!s.key || s.key.startsWith("timer:")) continue;
    if (wanted.has(s.key)) {
      alive.add(s.key);
      continue;
    }
    /**
     * try/catch per item, BUKAN sekali di luar loop.
     *
     * Dulu satu panggilan yang gagal ngelempar keluar dari `for`-nya, jadi
     * semua sisanya kelewat — dan karena pemanggilnya `void syncNotifications(...)`,
     * error-nya ketelen jadi unhandled rejection. Satu notifikasi rusak bisa
     * matiin SEMUA notifikasi setelahnya, tanpa jejak apa pun.
     */
    try {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
      cancelled++;
    } catch {
      failed++;
    }
  }

  let scheduled = 0;
  for (const p of plan) {
    if (alive.has(p.key)) continue;
    try {
      await schedule(p);
      scheduled++;
    } catch {
      failed++;
    }
  }

  return { planned: plan.length, cancelled, scheduled, failed };
}

async function schedule(p: PlannedNotification): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: p.title,
      body: p.body,
      // `key` buat rekonsiliasi, `taskId` buat deep-link (§6.7 aturan 3).
      data: { key: p.key, ...p.data },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(p.at),
      ...(Platform.OS === "android" ? { channelId: CH_REMINDER } : {}),
    },
  });
}

// ── notifikasi timer fokus ───────────────────────────────────────────────────

const TIMER_KEY = "timer:focus";

/** Batalin dulu yang lama, baru jadwalin — dipanggil tiap mulai & lanjut. */
export async function scheduleTimerDone(focus: FocusState): Promise<void> {
  await cancelTimerDone();

  const at = endsAt(focus);
  if (!at) return; // stopwatch atau lagi dijeda — gak ada yang perlu dibunyiin

  const work = focus.phase === "work";
  await Notifications.scheduleNotificationAsync({
    content: {
      title: work ? "Sesi selesai." : "Istirahat selesai.",
      body: work ? "Istirahat dulu?" : "Lanjut fokus?",
      data: { key: TIMER_KEY, ...(focus.taskId ? { taskId: focus.taskId } : {}) },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(at),
      ...(Platform.OS === "android" ? { channelId: CH_TIMER } : {}),
    },
  });
}

export async function cancelTimerDone(): Promise<void> {
  for (const s of await scheduledNow()) {
    if (s.key === TIMER_KEY) {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
    }
  }
}
