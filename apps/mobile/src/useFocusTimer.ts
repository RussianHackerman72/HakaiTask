/**
 * Jembatan antara mesin murni di core dan layar.
 *
 * Interval di sini CUMA manggil `setTick` — dia gak pernah ngurangin apa pun.
 * Angkanya diturunin ulang dari jam sistem tiap render lewat `focusView()`.
 * Itu yang bikin timernya bener walau app-nya sempat mati: gak ada hitungan
 * mundur yang perlu "dilanjutin".
 */
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
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
import { guardStatus, pauseGuard, startGuard, stopGuard, type GuardStatus } from "./guard";
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
  /**
   * Keadaan penjaga app SEKARANG — dibawa keluar biar layarnya bisa jujur.
   *
   * `null` pas lagi istirahat atau dijeda: penjaga emang sengaja dimatiin di
   * fase itu, jadi bukan kabar buruk. Yang perlu diomongin ke user cuma
   * "tanpa-izin" dan "gagal".
   */
  guard: GuardStatus | null;
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

  // Ditaruh di state, bukan diturunin ulang tiap render: `isAccessibilityEnabled()`
  // itu panggilan native, dan manggilnya 2x sedetik ikut tick timer sia-sia.
  const [guard, setGuard] = useState<GuardStatus | null>(null);

  /**
   * Turunin ulang keadaan penjaga pas MOUNT dan tiap app balik ke depan.
   *
   * Tanpa ini, `guard` cuma keisi di tiga titik transisi — start, resume,
   * finish — dan itu bikin dua kasus paling sering kejadian lolos:
   *
   *   1. App-nya restart di tengah sesi. Sesinya diturunin ulang dari store,
   *      tapi `guard` balik ke null, jadi peringatannya ilang.
   *   2. Izin aksesibilitasnya dicabut DI TENGAH sesi. Paksa berhenti app
   *      bikin Android nyabut sendiri — perilaku bawaan yang bahkan kita
   *      tulis sendiri di layar setelan.
   *
   * Dua-duanya balik ke bug yang mau dihapus: sesi yang kelihatan dijaga
   * padahal enggak. Dites di emulator — paksa berhenti, buka lagi, layarnya
   * diem aja.
   *
   * Deps sengaja kosong: `setGuard` di start/resume/finish itu hasil dari aksi
   * user yang lagi di depan layar, jadi gak bakal balapan sama efek ini.
   */
  useEffect(() => {
    const sync = () => {
      const f = useKaiStore.getState().focus;
      const aktif = !!f && f.phase === "work" && f.runningSince !== undefined;
      setGuard(aktif ? guardStatus() : null);
    };
    sync();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sync();
    });
    return () => sub.remove();
  }, []);

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
        setGuard(
          f.phase === "work"
            ? startGuard(f.taskId ? title : "Lagi fokus", endsAtOf(f), f.taskId)
            : null,
        );
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
    // Dijeda = gak lagi fokus. Nahan app pas lagi jeda itu cuma nyebelin —
    // tapi notifikasinya TETAP, biar bisa dilanjutin dari laci tanpa buka app.
    pauseGuard();
    setGuard(null);
  }, []);

  const resume = useCallback(() => {
    const f = useKaiStore.getState().focus;
    if (!f) return;
    useKaiStore.getState().setFocus(resumeFocus(f, new Date()));
    const next = useKaiStore.getState().focus;
    if (next) {
      void scheduleTimerDone(next);
      setGuard(
        next.phase === "work" ? startGuard(title, endsAtOf(next), next.taskId) : null,
      );
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
        if (r.next.phase === "work") {
          setGuard(startGuard(title, endsAtOf(r.next), r.next.taskId));
        } else {
          stopGuard();
          setGuard(null);
        }
      } else {
        void cancelTimerDone();
        stopGuard();
        setGuard(null);
      }
    },
    [userId, settings, title],
  );

  /**
   * Tombol Jeda / Selesai di notifikasi ongoing.
   *
   * Ditaruh SESUDAH `pause` dan `finish` dideklarasiin — array dependensinya
   * dibaca waktu render, jadi kalau efeknya naik ke atas, `finish` masih di
   * temporal dead zone dan render-nya lempar ReferenceError.
   *
   * Layanannya udah matiin dirinya sendiri sebelum event ini nyampe, jadi di
   * sini tinggal nyamain state-nya. `pauseGuard()`/`stopGuard()` di dalam `pause`/`finish`
   * jadi gak ada kerjaannya, dan itu gak apa-apa: dia idempoten.
   */
  useEffect(() => {
    const sub = FocusGuard.addListener("onGuardAction", (e) => {
      if (e.action === "pause") pause();
      else if (e.action === "resume") resume();
      else finish(true);
    });
    return () => sub.remove();
  }, [pause, resume, finish]);

  return {
    view: focus ? focusView(focus, now) : null,
    mode: focus?.mode ?? null,
    ...(focus?.taskId ? { taskId: focus.taskId } : {}),
    guard,
    start,
    pause,
    resume,
    interrupt,
    finish,
  };
}
