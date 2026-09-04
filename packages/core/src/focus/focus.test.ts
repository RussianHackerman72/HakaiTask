/**
 * Timer fokus — §6.3.
 *
 * Semua tes di sini nyuntik `now` sendiri, GAK pakai fake timer. Itu bukan
 * gaya-gayaan: yang mau dibuktiin justru bahwa mesinnya baca jam sistem dan
 * bukan nyimpen hitungan mundur. Fake timer malah nyembunyiin persis bug yang
 * dicari — timer yang bener cuma pas app-nya kebuka terus.
 */
import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  endFocus,
  endsAt,
  focusSessionsToday,
  focusView,
  isPaused,
  markInterrupted,
  pauseFocus,
  resumeFocus,
  startFocus,
  sumActualMin,
  type FocusState,
} from "./index.js";
import type { FocusSession } from "../types.js";

const NOW = new Date(2026, 7, 7, 10, 0, 0); // Jumat 7 Agu 2026, 10:00
const MIN = 60_000;

/** `now` + n menit. */
function at(min: number): Date {
  return new Date(NOW.getTime() + min * MIN);
}

function start(over: Partial<Parameters<typeof startFocus>[0]> = {}): FocusState {
  return startFocus({ sessionId: "s1", taskId: "t1", mode: "pomodoro", now: NOW, ...over });
}

describe("mulai", () => {
  it("pomodoro default 25 menit kerja", () => {
    const s = start();
    expect(s.phase).toBe("work");
    expect(s.totalMs).toBe(25 * MIN);
    expect(s.elapsedBeforePauseMs).toBe(0);
    expect(isPaused(s)).toBe(false);
  });

  it("setelan user nimpa preset pomodoro", () => {
    const s = start({ settings: { pomodoroWorkMin: 40, pomodoroBreakMin: 8 } });
    expect(s.totalMs).toBe(40 * MIN);
  });

  it("deep work 50 menit", () => {
    expect(start({ mode: "deep" }).totalMs).toBe(50 * MIN);
  });

  it("stopwatch gak punya target sama sekali", () => {
    const s = start({ mode: "stopwatch" });
    expect(s.totalMs).toBeUndefined();
    expect(focusView(s, at(120)).remainingMs).toBeUndefined();
  });
});

describe("waktu diturunin dari jam, bukan disimpan", () => {
  it("sisa waktu ngikut `now` yang dikasih", () => {
    const s = start();
    expect(focusView(s, NOW).remainingMs).toBe(25 * MIN);
    expect(focusView(s, at(10)).remainingMs).toBe(15 * MIN);
    expect(focusView(s, at(24)).remainingMs).toBe(1 * MIN);
  });

  /**
   * INI tes yang paling penting di berkas ini. App di-kill pas timer jalan,
   * dibuka lagi sejam kemudian — tanpa kode pemulihan apa pun, keadaannya
   * harus langsung bener.
   */
  it("app mati sejam lalu dibuka lagi: langsung `done`, gak nyangkut", () => {
    const s = start();
    const v = focusView(s, at(85));
    expect(v.done).toBe(true);
    expect(v.remainingMs).toBe(0);
    expect(v.label).toBe("0:00");
  });

  it("sisa waktu gak pernah negatif", () => {
    expect(focusView(start(), at(999)).remainingMs).toBe(0);
  });

  it("stopwatch jalan maju terus", () => {
    const s = start({ mode: "stopwatch" });
    expect(focusView(s, at(3)).label).toBe("3:00");
    expect(focusView(s, at(90)).label).toBe("90:00");
    expect(focusView(s, at(90)).done).toBe(false);
  });
});

describe("jeda & lanjut", () => {
  it("dijeda 30 menit: waktu tembok yang lewat gak kehitung", () => {
    const s = start();
    const paused = pauseFocus(s, at(10)); // 10 menit kepakai
    expect(isPaused(paused)).toBe(true);
    expect(paused.elapsedBeforePauseMs).toBe(10 * MIN);

    // Setengah jam berlalu sambil dijeda — angkanya HARUS diem.
    expect(focusView(paused, at(40)).remainingMs).toBe(15 * MIN);

    const resumed = resumeFocus(paused, at(40));
    expect(focusView(resumed, at(40)).remainingMs).toBe(15 * MIN);
    expect(focusView(resumed, at(45)).remainingMs).toBe(10 * MIN);
  });

  it("jeda-lanjut lima kali gak bikin waktu bocor", () => {
    let s: FocusState = start();
    let t = 0;
    for (let i = 0; i < 5; i++) {
      t += 2;
      s = pauseFocus(s, at(t)); // jalan 2 menit
      t += 10;
      s = resumeFocus(s, at(t)); // nganggur 10 menit
    }
    // Total jalan 10 menit, walau 60 menit tembok udah lewat.
    expect(elapsedMs(s, at(t))).toBe(10 * MIN);
    expect(focusView(s, at(t)).remainingMs).toBe(15 * MIN);
  });

  it("jeda dua kali berturut-turut gak ngubah apa-apa", () => {
    const once = pauseFocus(start(), at(5));
    expect(pauseFocus(once, at(9))).toEqual(once);
  });

  it("lanjut pas lagi jalan gak ngubah apa-apa", () => {
    const s = start();
    expect(resumeFocus(s, at(5))).toEqual(s);
  });

  it("`endsAt` kosong pas dijeda, dan mundur sesudah dilanjut", () => {
    const s = start();
    expect(endsAt(s)).toBe(new Date(NOW.getTime() + 25 * MIN).toISOString());

    const paused = pauseFocus(s, at(10));
    expect(endsAt(paused)).toBeUndefined();

    const resumed = resumeFocus(paused, at(40));
    expect(endsAt(resumed)).toBe(new Date(at(40).getTime() + 15 * MIN).toISOString());
  });
});

describe("tombol terganggu", () => {
  it("nambah hitungan TANPA nyentuh waktu sedikit pun", () => {
    const s = start();
    const before = { ...s };

    let after = markInterrupted(s);
    after = markInterrupted(after);
    after = markInterrupted(after);

    expect(after.interruptions).toBe(3);
    // Semua yang berhubungan sama waktu wajib persis sama.
    expect(after.runningSince).toBe(before.runningSince);
    expect(after.elapsedBeforePauseMs).toBe(before.elapsedBeforePauseMs);
    expect(after.totalMs).toBe(before.totalMs);
    expect(after.startedAt).toBe(before.startedAt);
    expect(focusView(after, at(10)).remainingMs).toBe(focusView(before, at(10)).remainingMs);
  });
});

describe("pergantian fase", () => {
  it("kerja → istirahat pendek", () => {
    const r = endFocus(start(), { now: at(25), userId: "u1", nextSessionId: "s2" });
    expect(r.next?.phase).toBe("break");
    expect(r.next?.totalMs).toBe(5 * MIN);
    expect(r.next?.completedWorkSessions).toBe(1);
  });

  it("sesi kerja ke-4 dapat istirahat PANJANG 15 menit", () => {
    const s = start({ completedWorkSessions: 3 });
    const r = endFocus(s, { now: at(25), userId: "u1", nextSessionId: "s2" });
    expect(r.next?.phase).toBe("long_break");
    expect(r.next?.totalMs).toBe(15 * MIN);
  });

  it("deep work gak pernah istirahat panjang", () => {
    for (const done of [3, 7, 11]) {
      const s = start({ mode: "deep", completedWorkSessions: done });
      const r = endFocus(s, { now: at(50), userId: "u1", nextSessionId: "s2" });
      expect(r.next?.phase).toBe("break");
      expect(r.next?.totalMs).toBe(10 * MIN);
    }
  });

  it("istirahat → balik kerja, hitungan sesi gak nambah", () => {
    const brk = start({ phase: "break", completedWorkSessions: 2 });
    const r = endFocus(brk, { now: at(5), userId: "u1", nextSessionId: "s3" });
    expect(r.next?.phase).toBe("work");
    expect(r.next?.completedWorkSessions).toBe(2);
  });

  it("`stop` berhenti total, gak lanjut istirahat", () => {
    const r = endFocus(start(), {
      now: at(25), userId: "u1", nextSessionId: "s2", stop: true,
    });
    expect(r.next).toBeNull();
  });
});

describe("catatan sesi", () => {
  it("fase kerja bikin baris focus_sessions", () => {
    const s = markInterrupted(start());
    const r = endFocus(s, { now: at(25), userId: "u1", nextSessionId: "s2" });

    expect(r.session).not.toBeNull();
    expect(r.session!.minutes).toBe(25);
    expect(r.session!.interruptions).toBe(1);
    expect(r.session!.taskId).toBe("t1");
    expect(r.session!.endedAt).toBe(at(25).toISOString());
  });

  /**
   * Istirahat sengaja TIDAK dicatat. Kalau ikut, "waktu fokus 6 jam 40 menit"
   * di review mingguan (§6.4) kegelembung sama waktu ngopi.
   */
  it("fase istirahat TIDAK bikin baris", () => {
    const brk = start({ phase: "break" });
    const r = endFocus(brk, { now: at(5), userId: "u1", nextSessionId: "s3" });
    expect(r.session).toBeNull();
  });

  it("menit dibuletin, dan jeda gak ikut kehitung", () => {
    let s: FocusState = start();
    s = pauseFocus(s, at(10));
    s = resumeFocus(s, at(40)); // nganggur 30 menit
    const r = endFocus(s, { now: at(45), userId: "u1" });
    expect(r.minutes).toBe(15); // 10 + 5, bukan 45
  });
});

describe("sumActualMin", () => {
  const S = (over: Partial<FocusSession>): FocusSession => ({
    id: "x", userId: "u1", taskId: "t1", startedAt: NOW.toISOString(),
    interruptions: 0, mode: "pomodoro", ...over,
  });

  it("jumlahin sesi milik task itu doang", () => {
    const all = [
      S({ id: "a", minutes: 25 }),
      S({ id: "b", minutes: 15 }),
      S({ id: "c", minutes: 99, taskId: "lain" }),
    ];
    expect(sumActualMin(all, "t1")).toBe(40);
  });

  /**
   * Sesi yang sama bisa nyampe dua kali (realtime + pull watermark). Kalau
   * dobel kehitung, `actualMin` naik sendiri tanpa ada yang ngerjain apa-apa.
   */
  it("kebal sesi dobel", () => {
    const dup = [S({ id: "a", minutes: 25 }), S({ id: "a", minutes: 25 })];
    expect(sumActualMin(dup, "t1")).toBe(25);
  });

  it("urutan datang gak ngaruh — dua device ketemu angka sama", () => {
    const a = [S({ id: "a", minutes: 25 }), S({ id: "b", minutes: 15 })];
    const b = [S({ id: "b", minutes: 15 }), S({ id: "a", minutes: 25 })];
    expect(sumActualMin(a, "t1")).toBe(sumActualMin(b, "t1"));
  });

  it("sesi tanpa menit dianggap nol, bukan NaN", () => {
    expect(sumActualMin([S({ id: "a" })], "t1")).toBe(0);
  });
});

describe("focusSessionsToday", () => {
  it("cuma ngitung yang kelar hari ini", () => {
    const mk = (id: string, endedAt?: string): FocusSession => ({
      id, userId: "u1", startedAt: NOW.toISOString(), interruptions: 0,
      mode: "pomodoro", ...(endedAt ? { endedAt } : {}),
    });
    const sessions = [
      mk("a", at(30).toISOString()),
      mk("b", at(120).toISOString()),
      mk("c", new Date(2026, 7, 6, 10, 0).toISOString()), // kemarin
      mk("d"), // belum kelar
    ];
    expect(focusSessionsToday(sessions, NOW)).toBe(2);
  });
});

describe("label", () => {
  it("mundur buat yang bertarget, maju buat stopwatch", () => {
    expect(focusView(start(), NOW).label).toBe("25:00");
    expect(focusView(start(), at(0.5)).label).toBe("24:30");
    expect(focusView(start({ mode: "stopwatch" }), at(0.5)).label).toBe("0:30");
  });

  it("nomor sesi ngikut fase", () => {
    expect(focusView(start({ completedWorkSessions: 1 }), NOW).sessionNumber).toBe(2);
    // Pas istirahat, nomornya gak maju — belum ada sesi kerja baru.
    const brk = start({ phase: "break", completedWorkSessions: 2 });
    expect(focusView(brk, NOW).sessionNumber).toBe(2);
  });
});
