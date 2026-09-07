/**
 * Terjemahan Task ↔ baris Postgres.
 *
 * Berkas ini satu-satunya tempat nama kolom ditulis, jadi salah ketik di sini
 * gak bikin apa pun gagal build — cuma bikin field-nya diem-diem GAK ikut
 * kesinkron. Bug yang paling telat ketauannya: jalan mulus di satu HP, dan
 * baru kelihatan pas dibuka di HP kedua.
 */
import { describe, expect, it } from "vitest";
import { makeTask, type Task } from "@hakaitask/core";
import { fromRow, toRow } from "./mapping.js";

function task(over: Partial<Task> = {}): Task {
  return makeTask({ id: "t1", userId: "u1", title: "Revisi vlog", ...over });
}

describe("mapping task", () => {
  it("syncState gak pernah dikirim ke server", () => {
    expect(toRow(task({ syncState: "pending" }))).not.toHaveProperty("syncState");
    expect(toRow(task({ syncState: "pending" }))).not.toHaveProperty("sync_state");
  });

  it("fromRow selalu nandain baris dari server sebagai synced", () => {
    expect(fromRow({ id: "t1", user_id: "u1", title: "x" }).syncState).toBe("synced");
  });

  /**
   * `reminders` itu jsonb dan bentuknya bersarang — beda dari kolom skalar
   * lain, jadi bolak-baliknya diuji langsung. Kalau ini putus, jadwal
   * pengingat kelihatan kesimpen di HP yang nyetel dan gak pernah nyampe ke
   * HP lain.
   */
  it("reminders bolak-balik utuh", () => {
    const reminders = {
      leads: [10080, 1440, 60],
      repeat: { startMin: 10080, everyMin: 1440 },
    };

    const row = toRow(task({ reminders }));
    expect(row.reminders).toEqual(reminders);
    expect(fromRow({ id: "t1", user_id: "u1", title: "x", ...row }).reminders).toEqual(
      reminders,
    );
  });

  it("reminderMin lama tetap kebaca — baris lama gak perlu dimigrasi", () => {
    const t = fromRow({ id: "t1", user_id: "u1", title: "x", reminder_min: 30 });
    expect(t.reminderMin).toBe(30);
    expect(t.reminders).toBeUndefined();
  });

  /** `undefined` harus jadi `null`, kalau enggak kolomnya gak pernah dikosongin. */
  it("field yang dihapus dikirim sebagai null", () => {
    expect(toRow({ reminders: undefined })).toEqual({ reminders: null });
  });
});
