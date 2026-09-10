/**
 * Setelan notifikasi — bagian yang beneran nulis `UserSettings`.
 *
 * Angka di sini bukan preferensi rasa. Tiap satu dipakai langsung sama
 * `planNotifications()` di core, jadi apa yang keliatan di layar ini bakal
 * kejadian persis di HP malam nanti. Itu sebabnya tiap kolom nyebut
 * akibatnya, bukan cuma namanya.
 */
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, View } from "react-native";
import type { UserSettings } from "@hakaitask/core";
import { patchSettings } from "@hakaitask/app/settings";
import { FocusGuard } from "../../modules/focus-guard";
import {
  hasNotificationPermission,
  requestNotificationPermission,
} from "../notifications";
import { useTheme } from "../theme";
import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { Field } from "../ui/Field";
import { T } from "../ui/T";
import { Tappable } from "../ui/Pressable";

const LEAD = [15, 30, 60, 120];
const MAKS = [2, 4, 6, 10];
const MULAI_TENANG = ["21:00", "22:00", "23:00", "00:00"];
const SELESAI_TENANG = ["05:00", "06:00", "07:00", "08:00"];

/**
 * null = gak bisa dicek (bukan Android, atau modul native-nya gak ada — Expo
 * Go). Sengaja dibedain dari false: "gak tau" bukan "mati", dan kartunya cuma
 * boleh nongol kalau kita beneran tau dia mati.
 */
function bacaAlarmPresisi(): boolean | null {
  if (Platform.OS !== "android") return null;
  try {
    return FocusGuard.canScheduleExactAlarms();
  } catch (e) {
    if (__DEV__) console.warn("[notif] cek alarm presisi gagal:", e);
    return null;
  }
}

function label(m: number): string {
  return m < 60 ? `${m} menit` : m === 60 ? "1 jam" : `${m / 60} jam`;
}

export function NotificationSettings({
  settings,
  userId,
}: {
  settings: UserSettings;
  userId: string;
}) {
  const th = useTheme();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [exact, setExact] = useState<boolean | null>(null);

  /**
   * Dicek ulang tiap app balik ke depan. Izin notifikasi bisa dimatiin dari
   * Setelan sistem kapan aja, dan layar setelan yang bilang "aktif" padahal
   * udah dicabut itu kebohongan yang paling gampang ketauan.
   */
  const refresh = useCallback(() => {
    void hasNotificationPermission().then(setGranted);
    setExact(bacaAlarmPresisi());
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const set = (patch: Partial<UserSettings>) => patchSettings(patch, userId);
  const [mulai, selesai] = settings.quietHours;

  return (
    <View style={{ gap: th.space[3] }}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
          <T variant="h2" style={{ fontSize: 15, flex: 1 }}>
            Izin notifikasi
          </T>
          <T variant="num" tone={granted ? "ink40" : "accent"}>
            {granted === null ? "…" : granted ? "aktif" : "belum"}
          </T>
        </View>
        <T variant="bodySm" tone="ink70">
          Tanpa ini, semua setelan di bawah gak ada efeknya — jadwalnya kepasang,
          cuma gak pernah bunyi.
        </T>
        {granted === false && (
          <Tappable
            onPress={() => void requestNotificationPermission().then(setGranted)}
            style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
          >
            <T variant="num" style={{ color: th.c.ink }}>
              Minta izin →
            </T>
          </Tappable>
        )}
      </Card>

      {/*
        Cuma muncul kalau alarm presisi BENERAN mati. Di Android 13+ itu gak
        pernah kejadian — USE_EXACT_ALARM gak bisa dicabut — jadi kartu yang
        selalu bilang "aktif" cuma manjangin layar tanpa nambah satu kabar pun.
      */}
      {exact === false && (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
            <T variant="h2" style={{ fontSize: 15, flex: 1 }}>
              Alarm presisi
            </T>
            <T variant="num" tone="accent">
              mati
            </T>
          </View>
          <T variant="bodySm" tone="ink70">
            Pengingat tetap dijadwalin, tapi Android boleh nunda sampai belasan
            menit buat hemat baterai. Jadinya telat, bukan hilang.
          </T>
          <Tappable
            onPress={() => {
              try {
                FocusGuard.openExactAlarmSettings();
              } catch (e) {
                if (__DEV__) console.warn("[notif] buka setelan alarm gagal:", e);
              }
            }}
            style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
          >
            <T variant="num" style={{ color: th.c.ink }}>
              Buka setelan →
            </T>
          </Tappable>
        </Card>
      )}

      <Field
        label="Pengingat bawaan"
        hint="Sebelum tenggat, buat task yang gak disetel sendiri."
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {LEAD.map((m) => (
            <Chip
              key={m}
              label={label(m)}
              active={settings.defaultReminderMin === m}
              onPress={() => set({ defaultReminderMin: m })}
            />
          ))}
        </View>
      </Field>

      <Field
        label="Maks notifikasi otomatis per hari"
        hint="Cuma buat yang otomatis — sapaan pagi, ringkasan tertunggak, review. Pengingat yang kamu setel sendiri di task GAK kena batas ini."
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MAKS.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              active={settings.maxNotifPerDay === n}
              onPress={() => set({ maxNotifPerDay: n })}
            />
          ))}
        </View>
      </Field>

      <Field
        label="Jam tenang"
        hint="Pengingat tunggal digeser keluar jam ini; yang berulang dilewatin."
      >
        <T variant="meta" tone="ink40">
          Mulai
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MULAI_TENANG.map((h) => (
            <Chip
              key={h}
              label={h}
              active={mulai === h}
              onPress={() => set({ quietHours: [h, selesai] })}
            />
          ))}
        </View>
        <T variant="meta" tone="ink40" style={{ marginTop: 8 }}>
          Selesai
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SELESAI_TENANG.map((h) => (
            <Chip
              key={h}
              label={h}
              active={selesai === h}
              onPress={() => set({ quietHours: [mulai, h] })}
            />
          ))}
        </View>
      </Field>

      <Field
        label="Sapaan pagi"
        hint="Cuma dikirim kalau hari itu ada yang jatuh tempo."
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["06:00", "07:00", "08:00"].map((h) => (
            <Chip
              key={h}
              label={h}
              active={settings.morningBriefAt === h}
              onPress={() => set({ morningBriefAt: h })}
            />
          ))}
          <Chip
            label="Mati"
            active={!settings.morningBriefAt}
            onPress={() => set({ morningBriefAt: undefined })}
          />
        </View>
      </Field>
    </View>
  );
}
