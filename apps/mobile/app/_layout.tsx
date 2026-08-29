// Wajib paling atas: supabase-js butuh URL/URLSearchParams yang gak ada di Hermes.
import "react-native-url-polyfill/auto";

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { configureStorage } from "@hakaitask/core/store";
import { configurePlatform } from "@hakaitask/app";
import { mobilePlatform, mobileStorage } from "../src/platform";

// Sinkron dan idempoten, jadi aman dipanggil saat modul dievaluasi — sama
// posisinya kayak `main.tsx` di web, sebelum store kesentuh siapa pun.
configurePlatform(mobilePlatform);

export default function RootLayout() {
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    // Hydrate-nya ditunda (`skipHydration` di core), jadi harus dipicu di sini.
    void configureStorage(mobileStorage).then(() => setSiap(true));
  }, []);

  if (!siap) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
