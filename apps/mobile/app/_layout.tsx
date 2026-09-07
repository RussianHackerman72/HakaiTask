// Wajib paling atas: supabase-js butuh URL/URLSearchParams yang gak ada di Hermes.
import "react-native-url-polyfill/auto";

import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { configureStorage } from "@hakaitask/core/store";
import { configurePlatform } from "@hakaitask/app";
import { mobilePlatform, mobileStorage } from "../src/platform";
import { ThemeProvider, useTheme } from "../src/theme";
import { useAuth } from "../src/auth";
import { useSync } from "../src/sync";
import {
  hasNotificationPermission,
  requestNotificationPermission,
  setupNotifications,
  syncNotifications,
} from "../src/notifications";
import { useShareIntent } from "expo-share-intent";
import { requestWidgetUpdate } from "react-native-android-widget";
import { FokusWidget } from "../src/widget/FokusWidget";
import { widgetProps } from "../src/widget/handler";
import { useKaiStore } from "@hakaitask/core/store";
import { DEFAULT_SETTINGS } from "@hakaitask/core";
import { selectTasks } from "@hakaitask/app";

// Sinkron dan idempoten, jadi aman dipanggil saat modul dievaluasi — posisinya
// sama kayak `main.tsx` di web, sebelum store kesentuh siapa pun.
configurePlatform(mobilePlatform);

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const [fontsReady] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    GeistMono_400Regular,
  });

  useEffect(() => {
    // Hydrate-nya ditunda (`skipHydration` di core), jadi dipicu di sini.
    void configureStorage(mobileStorage).then(() => setHydrated(true));
  }, []);

  // Nunggu DUA-duanya. Kalau font belum siap, RN diem-diem jatuh ke font
  // sistem dan teksnya sempet "lompat" pas font aslinya masuk.
  if (!hydrated || !fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Chrome />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Di dalam provider, biar warna bar-nya ikut tema. */
function Chrome() {
  const th = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const tasks = useKaiStore((s) => s.tasks);
  const settings = useKaiStore((s) => s.settings);
  /**
   * STATE, bukan ref. `setupNotifications()` itu async — pas efek penjadwalan
   * jalan pertama kali, izinnya belum tentu kelar diminta. Kalau dibaca dari
   * ref, jalan pertamanya kelewat diam-diam dan jadwalnya baru kepasang pas
   * app di-background lalu dibuka lagi. Sebagai state, efeknya jalan ulang
   * begitu izinnya beres.
   */
  const [notifReady, setNotifReady] = useState(false);

  /**
   * Izinnya dicek ULANG tiap app balik ke depan, bukan sekali pas mount.
   *
   * Kasusnya: user nolak di jalan pertama, terus nyalain sendiri lewat Setelan
   * sistem. Dulu `notifReady` gak pernah dibaca lagi — dan efek penjadwalan di
   * bawah nyangkut di belakangnya, termasuk listener AppState-nya. Jadi
   * jadwalnya baru kepasang setelah app dimatiin total dan dibuka lagi, yang
   * dari sisi user kebaca sebagai "izinnya udah dinyalain tapi tetep gak ada
   * notifikasi".
   *
   * Yang ini sengaja DI LUAR gerbang, biar bisa nutup gerbangnya sendiri.
   */
  useEffect(() => {
    void setupNotifications().then(setNotifReady);
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      // Cuma baca status, gak minta izin lagi — dialog izin yang nongol tiap
      // balik ke app itu cara tercepat bikin orang matiin notifikasi.
      void hasNotificationPermission().then(setNotifReady);
    });
    return () => sub.remove();
  }, []);

  /**
   * Baru minta izin kalau ada yang beneran perlu diingetin.
   *
   * Dialognya jadi nongol pas user baru bikin task bertenggat — bukan di
   * detik pertama app dibuka, waktu belum ada apa-apa buat diingetin. Sama
   * jumlah ketukannya, beda jauh peluang di-izinin.
   */
  const adaTenggat = useMemo(
    () =>
      selectTasks(tasks).some(
        (t) => t.dueAt && !t.deletedAt && t.status !== "done" && t.status !== "archived",
      ),
    [tasks],
  );

  useEffect(() => {
    if (notifReady || !adaTenggat) return;
    void requestNotificationPermission().then(setNotifReady);
  }, [adaTenggat, notifReady]);

  /**
   * Ketuk notifikasi → buka task-nya (§6.7 aturan 3).
   *
   * `getLastNotificationResponseAsync` itu yang gampang kelewat, padahal
   * justru kasus PALING umum: pas pengingat bunyi, app-nya biasanya lagi
   * mati. Tanpa itu, ngetuk notifikasi cuma buka halaman depan.
   */
  useEffect(() => {
    const open = (id?: unknown) => {
      if (typeof id === "string" && id) router.push(`/task/${id}`);
    };

    void Notifications.getLastNotificationResponseAsync().then((res) => {
      open((res?.notification.request.content.data as { taskId?: string })?.taskId);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      open((res.notification.request.content.data as { taskId?: string })?.taskId);
    });
    return () => sub.remove();
  }, [router]);

  /**
   * Teks yang di-share dari app lain (§ backlog #23) mendarat di kolom chat
   * sebagai TITIPAN, bukan langsung jadi task.
   *
   * Share itu memang sinyal eksplisit — tapi aturan "aba-aba wajib" tetap
   * berlaku: link YouTube telanjang gak punya kata perintah dan gak punya
   * waktu, jadi kalau langsung dibikin, judulnya jadi URL. Lewat kolom ketik,
   * user tinggal nambahin "tonton" atau "besok jam 8" di depannya.
   */
  const share = useShareIntent({ resetOnBackground: true });

  useEffect(() => {
    if (!share.hasShareIntent) return;
    const si = share.shareIntent;
    const text = (si.webUrl ?? si.text ?? "").trim();
    if (text) router.push({ pathname: "/(tabs)", params: { draft: text + " " } });
    share.resetShareIntent();
  }, [share, router]);

  /**
   * Jadwal disamain ulang tiap task/setelan berubah DAN tiap app balik ke
   * depan — cakrawalanya cuma 7 hari (batas alarm Android), jadi dia harus
   * digeser maju terus.
   */
  useEffect(() => {
    if (!notifReady) return;
    const run = () => {
      void syncNotifications({
        tasks: selectTasks(tasks),
        settings: settings ?? { ...DEFAULT_SETTINGS, userId: "local" },
      }).then((r) => {
        /**
         * Hasilnya dulu dibuang, padahal komentarnya sendiri bilang "kepake
         * buat log". Bug "kok notifnya gak muncul" jadi cuma bisa ditebak.
         *
         * `planned` khususnya kepake buat mantau plafon alarm Android
         * (~500 per app). Selama angkanya jauh di bawah itu, kita gak perlu
         * bikin penjatah global — dan kalau mulai naik, ketauan dari sini
         * duluan, bukan dari notifikasi yang diem-diem berhenti jalan.
         */
        if (__DEV__) {
          console.log(
            `[notif] planned=${r.planned} scheduled=${r.scheduled} cancelled=${r.cancelled} failed=${r.failed}`,
          );
        }
      });
    };
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    return () => sub.remove();
  }, [tasks, settings, notifReady]);

  /**
   * Widget didorong dari app tiap task berubah. Tanpa ini dia cuma ikut
   * `updatePeriodMillis` — dan lantai Android buat itu 30 menit, jadi task
   * yang baru dicentang tetep nangkring di layar utama setengah jam.
   */
  useEffect(() => {
    void requestWidgetUpdate({
      widgetName: "Fokus",
      renderWidget: () => <FokusWidget {...widgetProps(new Date())} />,
    }).catch(() => {
      // Belum ada widget yang dipasang — bukan error.
    });
  }, [tasks]);

  /**
   * Sync cuma jalan kalau beneran login. Keadaan `"local"` sengaja TIDAK
   * nyalain sync: id-nya cuma hidup di device ini, jadi ngirim ke server
   * malah bikin baris yatim yang gak akan pernah kebaca lagi.
   */
  useSync(auth.state === "signed-in" ? auth.userId : null);

  return (
    <>
      <StatusBar style={th.scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: th.c.paper },
        }}
      >
        <Stack.Screen name="task/[id]" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
