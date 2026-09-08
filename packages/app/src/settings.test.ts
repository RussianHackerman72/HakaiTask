/**
 * Setelan pengguna.
 *
 * Yang diuji di sini cuma satu sifat, tapi sifat itu yang bikin layar setelan
 * gak saling nimpa: `patchSettings` harus GABUNG, bukan ganti. Kalau dia
 * ganti, tiap layar yang nyetel satu angka bakal diam-diam ngembaliin semua
 * angka lain ke bawaan — dan gejalanya baru kelihatan nanti malam, waktu jam
 * tenang yang udah disetel ternyata balik ke 22:00.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { configureStorage, useKaiStore } from "@hakaitask/core/store";
import { emptyOutbox } from "@hakaitask/core/sync";
import { DEFAULT_SETTINGS } from "@hakaitask/core";
import { configurePlatform, type PlatformAdapter } from "./platform.js";
import { patchSettings, readSettings } from "./settings.js";

const USER = "u1";

function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (n) => map.get(n) ?? null,
    setItem: (n, v) => void map.set(n, v),
    removeItem: (n) => void map.delete(n),
  };
}

function memoryPlatform(): PlatformAdapter {
  const map = new Map<string, string>();
  let n = 0;
  return {
    uuid: () => `id-${++n}`,
    isDev: false,
    kv: {
      get: (k) => map.get(k) ?? null,
      set: (k, v) => void map.set(k, v),
      remove: (k) => void map.delete(k),
    },
  };
}

beforeEach(async () => {
  configurePlatform(memoryPlatform());
  await configureStorage(memoryStorage());
  useKaiStore.setState({
    tasks: {}, projects: {}, busyBlocks: {}, lexicon: {},
    settings: null, fieldTimes: {}, outbox: emptyOutbox(),
    online: true, hydrated: true,
  });
});

describe("setelan", () => {
  it("belum pernah disetel → jatuh ke bawaan, bukan null", () => {
    const s = readSettings(USER);
    expect(s.defaultReminderMin).toBe(DEFAULT_SETTINGS.defaultReminderMin);
    expect(s.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
    expect(s.userId).toBe(USER);
  });

  it("patch pertama nyimpen bawaan buat field yang gak disentuh", () => {
    patchSettings({ maxNotifPerDay: 9 }, USER);
    const s = readSettings(USER);
    expect(s.maxNotifPerDay).toBe(9);
    expect(s.defaultReminderMin).toBe(DEFAULT_SETTINGS.defaultReminderMin);
    expect(s.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
  });

  /** Inti berkas ini: dua layar nyetel dua angka, dua-duanya selamat. */
  it("patch kedua gak ngembaliin patch pertama ke bawaan", () => {
    patchSettings({ quietHours: ["23:00", "07:00"] }, USER);
    patchSettings({ defaultReminderMin: 15 }, USER);

    const s = readSettings(USER);
    expect(s.quietHours).toEqual(["23:00", "07:00"]);
    expect(s.defaultReminderMin).toBe(15);
  });

  it("bisa ngosongin field opsional", () => {
    expect(readSettings(USER).morningBriefAt).toBe(DEFAULT_SETTINGS.morningBriefAt);
    patchSettings({ morningBriefAt: undefined }, USER);
    expect(readSettings(USER).morningBriefAt).toBeUndefined();
  });

  it("userId selalu dari pemanggil, gak bisa ditimpa patch", () => {
    patchSettings({ userId: "orang-lain" }, USER);
    expect(readSettings(USER).userId).toBe(USER);
  });
});
