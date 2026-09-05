/**
 * Lapisan Android buat notifikasi — sengaja BODOH.
 *
 * Semua keputusan ada di `planNotifications()` (core, murni, 20 tes). Di sini
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
    await Notifications.setNotificationChannelAsync("default", {
      name: "Pengingat",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync("timer", {
      name: "Timer fokus",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250],
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
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
 * Samain jadwal di HP sama rencana dari core. Balikin berapa yang dibatalin
 * dan berapa yang baru — kepake buat log, dan bikin bug "kok gak muncul"
 * jauh lebih gampang dilacak.
 */
export async function syncNotifications(input: {
  tasks: readonly Task[];
  settings: UserSettings;
  now?: Date;
}): Promise<{ cancelled: number; scheduled: number }> {
  const plan = planNotifications({
    now: input.now ?? new Date(),
    tasks: input.tasks,
    settings: input.settings,
  });

  const wanted = new Map(plan.map((p) => [p.key, p]));
  const existing = await scheduledNow();

  let cancelled = 0;
  const alive = new Set<string>();

  for (const s of existing) {
    // Notifikasi timer gak diurus di sini — dia punya siklus sendiri.
    if (!s.key || s.key.startsWith("timer:")) continue;
    if (wanted.has(s.key)) {
      alive.add(s.key);
    } else {
      await Notifications.cancelScheduledNotificationAsync(s.identifier);
      cancelled++;
    }
  }

  let scheduled = 0;
  for (const p of plan) {
    if (alive.has(p.key)) continue;
    await schedule(p);
    scheduled++;
  }

  return { cancelled, scheduled };
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
      ...(Platform.OS === "android" ? { channelId: "default" } : {}),
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
      ...(Platform.OS === "android" ? { channelId: "timer" } : {}),
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
