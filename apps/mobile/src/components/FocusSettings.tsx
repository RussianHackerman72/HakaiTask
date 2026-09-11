/**
 * Setelan penjaga fokus — izin, mode ketat, daftar app yang ditahan.
 *
 * Diangkat dari `app/focus/setup.tsx` biar layar Setelan (fase 5) sama jalan
 * pintas di tengah sesi nampilin BENDA YANG SAMA, bukan dua salinan yang
 * pelan-pelan beda. Kalau dinyalain di satu tempat lalu dilihat di tempat
 * lain masih "belum", yang rusak bukan cuma tampilannya — user bakal nyalain
 * dua kali dan tetap gak yakin.
 *
 * Dua izin di sini dua-duanya izin KHUSUS: gak ada dialog "Izinkan?", user
 * harus nyalain sendiri di Setelan sistem. Jadi tiap kartu nunjukin KEADAAN
 * SEKARANG plus alasannya satu kalimat — bukan cuma tombol yang ngelempar
 * orang ke Setelan tanpa penjelasan.
 *
 * Dulu izinnya tiga. Yang ketiga (statistik pemakaian) dibuang: gak ada kode
 * yang pernah makai, tapi tetep bikin orang mikir dua kali pas dimintanya.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { FocusGuard, type InstalledApp } from "../../modules/focus-guard";
import { T } from "../ui/T";
import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { Input } from "../ui/Input";
import { Switch } from "../ui/Switch";
import { Tappable } from "../ui/Pressable";
import { Checkbox } from "../ui/Checkbox";
import { useTheme } from "../theme";
import { useBlocklist, useGuardSettings } from "../guard";

export function FocusSettings() {
  const th = useTheme();
  const { blocked, toggle } = useBlocklist();
  const { dnd, setDnd, strict, setStrict, graceSec, setGraceSec } = useGuardSettings();

  const [perms, setPerms] = useState({ a11y: false, dnd: false });
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [filter, setFilter] = useState("");

  /**
   * Berapa kali user udah balik dari Setelan aksesibilitas TANPA izinnya
   * nyala. Ini satu-satunya cara ngendus "Restricted settings" — Android gak
   * ngasih API buat nanya keadaan itu, jadi yang bisa dibaca cuma gejalanya:
   * dia pergi ke Setelan, balik, dan tombolnya masih mati.
   */
  const [a11yGagal, setA11yGagal] = useState(0);
  const nungguA11y = useRef(false);

  const refresh = useCallback(() => {
    const a11y = FocusGuard.isAccessibilityEnabled();
    setPerms({ a11y, dnd: FocusGuard.hasDndPermission() });

    if (nungguA11y.current) {
      nungguA11y.current = false;
      if (!a11y) setA11yGagal((n) => n + 1);
    }
    if (a11y) setA11yGagal(0);
  }, []);

  useEffect(() => {
    refresh();
    try {
      setApps(FocusGuard.listInstalledApps());
    } catch {
      setApps([]);
    }
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? apps.filter((a) => a.label.toLowerCase().includes(q)) : apps;
    return [...list].sort(
      (a, b) => Number(blocked.includes(b.packageName)) - Number(blocked.includes(a.packageName)),
    );
  }, [apps, filter, blocked]);

  return (
    <View style={{ gap: th.space[4] }}>
      <Perm
        label="Lihat app yang lagi kebuka"
        why="Dipakai buat tau kapan app yang kamu blokir kebuka. Isi layar gak dibaca."
        granted={perms.a11y}
        onPress={() => {
          nungguA11y.current = true;
          FocusGuard.openAccessibilitySettings();
        }}
      />

      {/*
        Android 13+ ngunci tombol aksesibilitas buat app yang dipasang di
        luar Play — dan tombolnya cuma kelihatan ABU-ABU, tanpa sepatah kata
        kenapa. Dari sisi user itu kebaca sebagai app-nya yang rusak.

        Gak ada API buat ngecek keadaan ini. Dulu kartunya nunggu DUA kali
        gagal dulu baru nongol — alasannya "sekali bisa aja dia cuma batal".
        Masuk akal buat app biasa, tapi app ini gak pernah dipasang dari Play
        dan gak akan pernah (lihat §"Play Protect" di README). Artinya
        penguncian ini bukan kasus pinggiran yang perlu ditebak dari gejala:
        dia keadaan BAWAAN buat tiap orang yang masang app ini.

        Jadi nunggunya cuma bikin orang bolak-balik ke Setelan dua kali buat
        nemu tembok yang sama, sebelum akhirnya dikasih tau. Sekarang dikasih
        tau di depan; hitungan gagalnya tinggal dipakai buat ganti nada, dari
        "bakal" jadi "ini yang lagi kejadian".

        Dan ini emang gak bisa diakalin dari kode — pengunciannya justru ada
        supaya app gak bisa nyalain layanan aksesibilitasnya sendiri, persis
        langkah yang dipakai malware. Yang bisa kita kasih cuma kalimat yang
        jujur plus jalan pintas ke halaman yang bener.
      */}
      {!perms.a11y && (
        <Card style={{ gap: 8 }}>
          <T variant="h2" style={{ fontSize: 15 }}>
            {a11yGagal >= 1
              ? "Tombolnya abu-abu dan gak bisa dipencet?"
              : "Tombolnya bakal abu-abu — ini jalan keluarnya"}
          </T>
          <T variant="bodySm" tone="ink70">
            Itu bukan app-nya rusak. Android ngunci tombol ini buat app yang
            dipasang di luar Play Store. Buka info app, ketuk ⋮ di pojok kanan
            atas, pilih “Allow restricted settings”, lalu balik ke Setelan
            aksesibilitas.
          </T>
          <Tappable
            onPress={() => FocusGuard.openAppDetailsSettings()}
            style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
          >
            <T variant="num" style={{ color: th.c.ink }}>
              Buka info app →
            </T>
          </Tappable>
          <T variant="meta" tone="ink40">
            Sekalian: kalau kamu pernah paksa berhenti HaKaiTask, Android
            matiin izin ini sendiri. Itu perilaku bawaan buat semua layanan
            aksesibilitas, bukan cuma app ini.
          </T>
        </Card>
      )}

      <Perm
        label="Mode jangan ganggu"
        why="Biar notifikasi lain diem selama sesi fokus."
        granted={perms.dnd}
        onPress={() => FocusGuard.openDndSettings()}
      />

      {perms.dnd && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
          <Checkbox
            checked={dnd}
            onChange={() => setDnd(!dnd)}
            label="Nyalain jangan ganggu tiap sesi"
            size={20}
          />
          <T variant="bodySm">Nyalain jangan ganggu tiap sesi</T>
        </View>
      )}

      {/*
        TODO(fase 5): pindah ke layar Setelan begitu ada. Di sini dulu karena
        layar ini yang de-facto setelan fokus.
      */}
      <Card style={{ gap: th.space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
          <View style={{ flex: 1 }}>
            <T variant="h2" style={{ fontSize: 15 }}>Mode ketat</T>
            <T variant="bodySm" tone="ink70">
              Bukan cuma app di daftar — apa pun yang kamu buka selain HaKaiTask
              kehitung, kalau kelamaan.
            </T>
          </View>
          <Switch value={strict} onChange={setStrict} />
        </View>

        {strict && (
          <>
            <T variant="bodySm" tone="ink70">
              Ditegur kalau di luar app lebih dari:
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[10, 15, 30, 60].map((s) => (
                <Chip
                  key={s}
                  label={s < 60 ? `${s} detik` : "1 menit"}
                  active={graceSec === s}
                  onPress={() => setGraceSec(s)}
                />
              ))}
            </View>
            <T variant="meta" tone="ink40">
              Telepon, Setelan, dan papan ketik gak pernah kehitung — sesi fokus
              gak boleh bikin kamu gagal ngangkat telepon. Layar mati dan laci
              notifikasi juga enggak.
            </T>
            {!perms.a11y && (
              <T variant="bodySm" tone="accent">
                Butuh izin aksesibilitas di atas buat jalan.
              </T>
            )}
          </>
        )}
      </Card>

      <View style={{ gap: th.space[2] }}>
        <T variant="h2" style={{ fontSize: 15 }}>
          App yang ditahan {blocked.length > 0 ? `(${blocked.length})` : ""}
        </T>

        <Input
          tone="filled"
          value={filter}
          onChangeText={setFilter}
          placeholder="Cari app…"
        />

        {apps.length === 0 ? (
          <T variant="bodySm" tone="ink40">Daftar app-nya belum kebaca.</T>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {shown.slice(0, 40).map((a) => (
              <Chip
                key={a.packageName}
                label={a.label}
                active={blocked.includes(a.packageName)}
                onPress={() => toggle(a.packageName)}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Perm({
  label,
  why,
  granted,
  onPress,
}: {
  label: string;
  why: string;
  granted: boolean;
  onPress: () => void;
}) {
  const th = useTheme();
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: th.space[2] }}>
        <T variant="h2" style={{ fontSize: 15, flex: 1 }}>{label}</T>
        <T variant="num" tone={granted ? "ink40" : "accent"}>
          {granted ? "aktif" : "belum"}
        </T>
      </View>
      <T variant="bodySm" tone="ink70">{why}</T>
      {/*
        Jalan ke Setelan tetap kebuka sesudah izinnya dikasih.

        Dulu tautannya ilang begitu `granted` — jadi barisnya cuma bisa dibaca,
        gak bisa dipakai. Padahal izin itu dua arah: yang udah nyalain juga
        berhak matiin, dan satu-satunya tempat matiinnya ya Setelan sistem yang
        sama. Nyembunyiin jalan ke sana bikin kartunya kebaca rusak, bukan
        kebaca beres.
      */}
      <Tappable onPress={onPress} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
        <T variant="num" style={{ color: th.c.ink }}>
          {granted ? "Ubah di Setelan →" : "Buka setelan →"}
        </T>
      </Tappable>
    </Card>
  );
}
