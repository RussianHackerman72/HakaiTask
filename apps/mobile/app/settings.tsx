/**
 * Setelan.
 *
 * Layar ini PENULIS PERTAMA `UserSettings`. Tipenya sama `DEFAULT_SETTINGS`
 * udah ada di core dari awal dan `setSettings` udah ada di store, tapi gak
 * ada satu pun yang manggil — semua pemakainya (penjadwal notifikasi, timer
 * fokus, layout akar) selama ini jatuh ke bawaan. Jadi sampai sekarang
 * "setelan" itu tipe yang gak ada isinya.
 *
 * Di luar `(tabs)`, sama kayak `task/[id]` dan `focus/*`: setelan itu tempat
 * yang dikunjungi, bukan tempat yang ditongkrongin. Naruh dia jadi tab
 * keempat bikin dia keliatan sepenting chat, dashboard, dan kalender.
 */
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useIdentity, useAuth } from "../src/auth";
import { patchSettings, useSettings } from "@hakaitask/app/settings";
import type { ThemePref } from "@hakaitask/app/theme";
import { Screen } from "../src/ui/Screen";
import { T } from "../src/ui/T";
import { Card } from "../src/ui/Card";
import { Chip } from "../src/ui/Chip";
import { Pill } from "../src/ui/Pill";
import { Row } from "../src/ui/Row";
import { Section } from "../src/ui/Section";
import { useTheme, useThemePref } from "../src/theme";
import { FocusSettings } from "../src/components/FocusSettings";
import { NotificationSettings } from "../src/components/NotificationSettings";

const TEMA: { p: ThemePref; label: string }[] = [
  { p: "system", label: "Ikut sistem" },
  { p: "light", label: "Terang" },
  { p: "dark", label: "Gelap" },
];

export default function Settings() {
  const th = useTheme();
  const router = useRouter();
  const { userId } = useIdentity();
  const auth = useAuth();
  const settings = useSettings(userId);

  /**
   * `useThemePref` dari dulu udah balikin TIGA keadaan lengkap sama
   * penyimpanannya — tapi satu-satunya kendali di app cuma sakelar dua arah
   * di header chat, yang mana gak bisa milih "ikut sistem" sama sekali. Sekali
   * dipencet, temanya kepaku dan gak pernah bisa balik ngikut HP lagi.
   * Di sini nol logika baru, cuma keadaan ketiganya akhirnya kelihatan.
   */
  const { pref, setPref } = useThemePref();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: th.space[3], gap: th.space[3] }}>
        <T variant="h1" style={{ fontSize: 26 }}>
          Setelan
        </T>

        <Section label="Tampilan">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TEMA.map((x) => (
              <Chip
                key={x.p}
                label={x.label}
                active={pref === x.p}
                onPress={() => setPref(x.p)}
              />
            ))}
          </View>
        </Section>

        <Section label="Notifikasi">
          <NotificationSettings settings={settings} userId={userId} />
        </Section>

        <Section label="Penjaga fokus">
          <FocusSettings />
        </Section>

        <Section label="Akun">
          <Card style={{ gap: th.space[2] }}>
            {auth.state === "signed-in" ? (
              <>
                <T variant="bodySm" tone="ink70">
                  Masuk sebagai {auth.name}. Task kamu kesinkron ke perangkat lain.
                </T>
                <Pill
                  label="Keluar"
                  tone="soft"
                  onPress={auth.signOut}
                  style={{ alignSelf: "flex-start" }}
                />
              </>
            ) : (
              <>
                <T variant="bodySm" tone="ink70">
                  Belum masuk. Semua data cuma ada di HP ini — aman, tapi gak
                  kesinkron dan gak ikut kalau HP-nya ganti.
                </T>
                <Pill
                  label="Masuk"
                  onPress={() => router.push("/sign-in")}
                  style={{ alignSelf: "flex-start" }}
                />
              </>
            )}
          </Card>

          {/*
            Setelan di layar ini SENGAJA gak ikut kesinkron, dan itu ditulis
            terang-terangan: jam tenang HP kerja emang wajar beda sama HP
            pribadi, dan daftar app yang ditahan isinya paket yang belum tentu
            kepasang di HP satunya. Kalau gak dibilang, orang bakal nyetel di
            satu HP lalu ngira sinkronisasinya rusak.
          */}
          <T variant="meta" tone="ink40">
            Setelan di halaman ini nempel di HP ini aja, gak ikut kesinkron.
          </T>
        </Section>

        <Pill label="Selesai" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
