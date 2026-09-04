/**
 * Layar masuk. Sengaja gak maksa: app-nya udah kepakai penuh tanpa login,
 * dan yang didapat dari masuk cuma satu — sync lintas perangkat.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/ui/Screen";
import { T } from "../src/ui/T";
import { Pill } from "../src/ui/Pill";
import { useTheme } from "../src/theme";
import { useSignIn } from "../src/auth";

export default function SignIn() {
  const th = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const { busy, sent, error, magicLink, google } = useSignIn();

  return (
    <Screen>
      {/* Tanpa ini keyboard nutupin tombol "pakai lokal dulu" di HP layar kecil. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: th.space[3] }}
          keyboardShouldPersistTaps="handled"
        >
        <T variant="display">HaKaiTask</T>
        <T variant="body" tone="ink70">
          Masuk buat nyimpen task kamu lintas perangkat. Datanya tetap ada di HP walau
          lagi offline.
        </T>

        {sent ? (
          <T variant="bodySm" style={{ marginTop: th.space[3] }}>
            Link masuk udah dikirim ke <T variant="bodySm" tone="ink70">{email}</T>. Cek email
            kamu, lalu buka linknya dari HP ini.
          </T>
        ) : (
          <View style={{ gap: 10, marginTop: th.space[3] }}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email kamu"
              placeholderTextColor={th.c.ink40}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              style={{
                backgroundColor: th.c.surface,
                borderRadius: th.radius.full,
                paddingHorizontal: 20,
                paddingVertical: 14,
                color: th.c.ink,
                ...th.t.body,
              }}
            />
            <Pill
              label={busy ? "Mengirim…" : "Kirim link masuk"}
              disabled={busy || !email.trim()}
              onPress={() => void magicLink(email)}
            />
            <Pill
              label="Lanjut dengan Google"
              tone="soft"
              disabled={busy}
              onPress={() => void google()}
            />
          </View>
        )}

        {error ? (
          <T variant="bodySm" tone="accent" style={{ marginTop: th.space[2] }}>
            {error}
          </T>
        ) : null}

        <Pill
          label="Nanti aja, pakai lokal dulu"
          tone="soft"
          style={{ marginTop: th.space[4] }}
          onPress={() => router.replace("/(tabs)")}
        />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
