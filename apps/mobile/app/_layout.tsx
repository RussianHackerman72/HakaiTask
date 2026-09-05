// Wajib paling atas: supabase-js butuh URL/URLSearchParams yang gak ada di Hermes.
import "react-native-url-polyfill/auto";

import { useEffect, useRef, useState } from "react";
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
import { setupNotifications, syncNotifications } from "../src/notifications";
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
  const ready = useRef(false);

  useEffect(() => {
    void setupNotifications().then((ok) => {
      ready.current = ok;
    });
  }, []);

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
   * Jadwal disamain ulang tiap task/setelan berubah DAN tiap app balik ke
   * depan — cakrawalanya cuma 7 hari (batas alarm Android), jadi dia harus
   * digeser maju terus.
   */
  useEffect(() => {
    const run = () => {
      if (!ready.current) return;
      void syncNotifications({
        tasks: selectTasks(tasks),
        settings: settings ?? { ...DEFAULT_SETTINGS, userId: "local" },
      });
    };
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    return () => sub.remove();
  }, [tasks, settings]);

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
