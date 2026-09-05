/**
 * Jembatan antara mesin murni di core dan layar.
 *
 * Interval di sini CUMA manggil `setTick` — dia gak pernah ngurangin apa pun.
 * Angkanya diturunin ulang dari jam sistem tiap render lewat `focusView()`.
 * Itu yang bikin timernya bener walau app-nya sempat mati: gak ada hitungan
 * mundur yang perlu "dilanjutin".
 */
import { useCallback, useEffect, useState } from "react";
import {
  endFocus,
  focusView,
  markInterrupted as markCore,
  pauseFocus,
  resumeFocus,
  startFocus,
  type FocusMode,
  type FocusView,
} from "@hakaitask/core/focus";
import { useKaiStore } from "@hakaitask/core/store";
import { newId } from "@hakaitask/app/tasks";
import { cancelTimerDone, scheduleTimerDone } from "./notifications";
import { startGuard, stopGuard } from "./guard";
import { FocusGuard } from "../modules/focus-guard";
import { endsAt as endsAtOf } from "@hakaitask/core/focus";

/** Nge-tick tiap 500ms — cukup buat detik yang mulus, hemat buat baterai. */
function useTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export interface FocusTimer {
  view: FocusView | null;
  mode: FocusMode | null;
  taskId?: string;
  start: (mode: FocusMode, taskId?: string) => void;
  pause: () => void;
  resume: () => void;
  interrupt: () => void;
  /** Sudahi fase ini. `stop` = berhenti total, jangan lanjut istirahat. */
  finish: (stop?: boolean) => void;
}

export function useFocusTimer(userId: string, title = "Lagi fokus"): FocusTimer {
  const focus = useKaiStore((s) => s.focus);
  const settings = useKaiStore((s) => s.settings);

  // Jangan tick pas dijeda — gak ada yang berubah, dan itu cuma bikin render
  // dua kali sedetik tanpa alasan.
  const now = useTick(focus !== null && focus.runningSince !== undefined);

  const start = useCallback(
    (mode: FocusMode, taskId?: string) => {
      useKaiStore.getState().setFocus(
        startFocus({
          sessionId: newId(),
          ...(taskId ? { taskId } : {}),
          mode,
          now: new Date(),
          ...(settings ? { settings } : {}),
        }),
      );
      const f = useKaiStore.getState().focus;
      if (f) {
        void scheduleTimerDone(f);
        // Cuma pas kerja. Ngeblokir app pas lagi ISTIRAHAT itu justru ngelawan
        // gunanya istirahat.
        if (f.phase === "work") startGuard(f.taskId ? title : "Lagi fokus", endsAtOf(f));
      }
    },
    [settings, title],
  );

  // Dijeda = gak ada yang perlu bunyi. Kalau notifnya dibiarin, dia bunyi
  // di waktu yang udah gak nyambung sama apa pun yang kelihatan di layar.
  const pause = useCallback(() => {
    const f = useKaiStore.getState().focus;
    if (!f) return;
    useKaiStore.getState().setFocus(pauseFocus(f, new Date()));
    void cancelTimerDone();
    // Dijeda = gak lagi fokus. Nahan app pas lagi jeda itu cuma nyebelin.
    stopGuard();
  }, []);

  const resume = useCallback(() => {
    const f = useKaiStore.getState().focus;
    if (!f) return;
    useKaiStore.getState().setFocus(resumeFocus(f, new Date()));
    const next = useKaiStore.getState().focus;
    if (next) {
      void scheduleTimerDone(next);
      if (next.phase === "work") startGuard(title, endsAtOf(next));
    }
  }, [title]);

  /**
   * INI bagian yang bikin §6.3 jadi lebih jujur daripada rencananya.
   *
   * Tombol "terganggu" itu manual karena dulu gak ada cara ngukur gangguan.
   * Sekarang tiap percobaan buka app yang diblokir kecatat SENDIRI — persis
   * tujuan yang ditulis spec-nya ("datanya jauh lebih jujur daripada cuma
   * total waktu"), lewat jalan yang lebih baik. Tombolnya tetap ada buat
   * gangguan yang bukan salah HP.
   */
  useEffect(() => {
    const sub = FocusGuard.addListener("onBlockedAttempt", () => {
      const f = useKaiStore.getState().focus;
      if (f) useKaiStore.getState().setFocus(markCore(f));
    });
    return () => sub.remove();
  }, []);

  const interrupt = useCallback(() => {
    const f = useKaiStore.getState().focus;
    if (f) useKaiStore.getState().setFocus(markCore(f));
  }, []);

  const finish = useCallback(
    (stop = false) => {
      const store = useKaiStore.getState();
      const f = store.focus;
      if (!f) return;

      const r = endFocus(f, {
        now: new Date(),
        userId,
        nextSessionId: newId(),
        ...(settings ? { settings } : {}),
        stop,
      });

      // Sesi dulu, baru hitung ulang total menit task-nya — urutannya penting,
      // `recomputeActualMin` baca dari daftar sesi yang udah masuk.
      if (r.session) {
        store.upsertFocusSession(r.session);
        if (r.session.taskId) store.recomputeActualMin(r.session.taskId);
      }
      store.setFocus(r.next);
      if (r.next) {
        void scheduleTimerDone(r.next);
        if (r.next.phase === "work") startGuard(title, endsAtOf(r.next));
        else stopGuard();
      } else {
        void cancelTimerDone();
        stopGuard();
      }
    },
    [userId, settings, title],
  );

  return {
    view: focus ? focusView(focus, now) : null,
    mode: focus?.mode ?? null,
    ...(focus?.taskId ? { taskId: focus.taskId } : {}),
    start,
    pause,
    resume,
    interrupt,
    finish,
  };
}
