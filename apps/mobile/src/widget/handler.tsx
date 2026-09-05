/**
 * Task handler widget — jalan di proses HEADLESS, tanpa React tree.
 *
 * Ini yang bikin dia beda dari layar biasa: gak ada store yang udah hidup, gak
 * ada provider, gak ada hook. Semuanya harus dibaca ulang dari MMKV dan
 * diturunin lagi lewat `selectFocus` — fungsi YANG SAMA persis yang dipakai
 * dashboard, biar widget dan app gak pernah bilang dua hal berbeda.
 */
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { inferEnergyMode, selectFocus, type Task } from "@hakaitask/core";
import { whenLabel, isOverdue } from "@hakaitask/app/format";
import { mobilePlatform } from "../platform";
import { FokusWidget, type FokusWidgetProps } from "./FokusWidget";

/** Kunci yang dipakai `persist` di core — lihat store/index.ts. */
const STORE_KEY = "hakaitask";

/**
 * Baca task langsung dari MMKV. Bentuk yang disimpan itu ANTARMUKA antara app
 * dan widget — kalau `partialize` di core berubah, ini ikut berubah, dan
 * `version` di persist yang jadi penanda kapan itu terjadi.
 */
function readTasks(): Task[] {
  try {
    const raw = mobilePlatform.kv.get(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { tasks?: Record<string, Task> } };
    return Object.values(parsed.state?.tasks ?? {});
  } catch {
    // Widget yang crash bikin kotak "Problem loading widget" nempel di layar
    // utama sampai dicopot manual. Jadi apa pun yang salah, tampil kosong.
    return [];
  }
}

export function widgetProps(now: Date): FokusWidgetProps {
  const tasks = readTasks();
  if (tasks.length === 0) return { title: null, when: "", rest: 0, overdue: false };

  const sel = selectFocus(tasks, { now, energyMode: inferEnergyMode(now) });
  if (!sel.focus) return { title: null, when: "", rest: 0, overdue: false };

  return {
    title: sel.focus.title,
    when: whenLabel(sel.focus.dueAt, now, sel.focus.allDay) || "Kapan aja",
    rest: sel.upcoming.length,
    overdue: isOverdue(sel.focus, now),
    ...(sel.focus.id ? { taskId: sel.focus.id } : {}),
  };
}

export async function widgetTaskHandler(p: WidgetTaskHandlerProps): Promise<void> {
  switch (p.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      p.renderWidget(<FokusWidget {...widgetProps(new Date())} />);
      return;

    // Ketukan diurus lewat clickAction OPEN_URI di komponennya, jadi di sini
    // cukup gambar ulang — datanya mungkin udah berubah sejak terakhir.
    case "WIDGET_CLICK":
      p.renderWidget(<FokusWidget {...widgetProps(new Date())} />);
      return;

    case "WIDGET_DELETED":
      return;
  }
}
