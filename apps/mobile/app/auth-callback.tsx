/**
 * Tujuan balik magic link. OAuth Google gak lewat sini — dia ditangani
 * langsung di `useSignIn` lewat `openAuthSessionAsync`, jadi kodenya ditukar
 * tanpa pernah ninggalin layar masuk.
 *
 * Yang mendarat di sini cuma link dari email, dan bentuknya bisa dua macam:
 * PKCE ngasih `?code=`, sedangkan link lama ngasih `#access_token=`.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { Screen } from "../src/ui/Screen";
import { T } from "../src/ui/T";
import { Pill } from "../src/ui/Pill";
import { useTheme } from "../src/theme";
import { supabase } from "../src/supabase";

export default function AuthCallback() {
  const th = useTheme();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!supabase) return router.replace("/(tabs)");

      const initial = await Linking.getInitialURL();
      const href = initial ?? "";
      const parsed = href ? Linking.parse(href) : null;
      const code = (parsed?.queryParams?.code as string | undefined) ?? null;

      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (err) return setError(err.message);
      }

      if (!cancelled) router.replace("/(tabs)");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: th.space[3] }}>
        {error ? (
          <>
            <T variant="h2">Gagal masuk.</T>
            <T variant="bodySm" tone="ink70">{error}</T>
            <Pill label="Coba lagi" tone="soft" onPress={() => router.replace("/sign-in")} />
          </>
        ) : (
          <T variant="bodySm" tone="ink70">Sebentar, lagi nyelesaiin masuk…</T>
        )}
      </View>
    </Screen>
  );
}
