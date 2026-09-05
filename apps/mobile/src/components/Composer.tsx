/**
 * Kolom ketik + saran + tombol bersihkan.
 *
 * "Bersihkan chat" nempel di blok bawah ini, BUKAN di atas daftar pesan.
 * Waktu ditaruh di atas, dia ketutup begitu percakapannya panjang — persis
 * masalah yang dulu bikin navbar di web dibikin sticky.
 */
import { TextInput, View } from "react-native";
import { useVoice } from "../useVoice";
import { respond } from "@hakaitask/core/chat";
import { useTheme } from "../theme";
import { T } from "../ui/T";
import { Tappable } from "../ui/Pressable";
import { Pill } from "../ui/Pill";

export function Composer({
  value,
  onChange,
  onSubmit,
  onClear,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Kosong kalau belum ada yang bisa dibersihin. */
  onClear?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  const th = useTheme();
  const filled = value.trim().length > 0;

  /**
   * Hasil suara DISAMBUNG ke apa yang udah ada, bukan nimpa — orang sering
   * ngetik separuh lalu males, dan kehilangan ketikan sendiri gara-gara mencet
   * mik itu bikin fiturnya gak dipercaya.
   *
   * Dan yang paling penting: ini cuma NARUH TEKS. Gak ada `onSubmit()` di
   * sini — salah dengar harus kelihatan dulu sebelum jadi data.
   */
  const voice = useVoice((text) => {
    onChange(value.trim() ? value.trimEnd() + " " + text : text);
  });

  return (
    <View style={{ paddingHorizontal: th.space[4], paddingBottom: th.space[3], gap: 8 }}>
      {onClear && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Tappable
            onPress={onClear}
            style={{
              backgroundColor: th.c.surface,
              borderRadius: th.radius.full,
              paddingHorizontal: 12,
              paddingVertical: 6,
              minHeight: 32,
            }}
          >
            <T variant="num" tone="ink40">Bersihkan chat</T>
          </Tappable>
        </View>
      )}

      <View
        style={{
          backgroundColor: th.c.surface,
          borderRadius: th.radius.md,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <T variant="num" tone="ink40">›</T>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          blurOnSubmit={false}
          returnKeyType="send"
          placeholder="Tulis perintah atau pertanyaan"
          placeholderTextColor={th.c.ink40}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            flex: 1,
            paddingVertical: 16,
            color: th.c.ink,
            ...th.t.body,
            fontFamily: "PlusJakartaSans_600SemiBold",
          }}
        />
        <Tappable
          onPress={() => (voice.listening ? voice.stop() : void voice.start())}
          style={{
            width: 36,
            height: 36,
            borderRadius: th.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: voice.listening ? th.c.accent : th.c.subtle,
          }}
        >
          <T variant="body" style={{ color: voice.listening ? th.c.surface : th.c.ink70 }}>
            ●
          </T>
        </Tappable>

        {filled && <Pill label="Kirim" onPress={onSubmit} style={{ paddingVertical: 8 }} />}
      </View>

      {voice.listening || voice.partial ? (
        <T variant="num" tone="ink40">
          {voice.partial ? voice.partial : "Dengerin… ngomong aja."}
        </T>
      ) : null}

      {voice.error ? (
        <T variant="num" tone="accent">{voice.error}</T>
      ) : null}

      {/*
        Contoh yang bisa diketuk — jauh lebih kepake daripada dokumentasi (§10).

        Ditumpuk ke BAWAH, bukan `flexWrap` menyamping, dan tiap chip
        direntangin selebar kolom. Waktu pakai wrap, chip yang isinya kepanjang
        dikit (40 huruf lawan 39) melar ngelewatin baris dan huruf terakhirnya
        KEPOTONG — "besok jam 3" jadi "besok jam". Dikasih lebar pasti,
        teksnya tinggal pindah baris kayak teks biasa.
      */}
      {!filled && (
        <View style={{ gap: 6, alignItems: "flex-start" }}>
          {respond.HELP_EXAMPLES.slice(0, 3).map((e) => (
            <Tappable
              key={e}
              onPress={() => onChange(e)}
              style={{
                alignSelf: "stretch",
                backgroundColor: th.c.surface,
                borderRadius: th.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 8,
                minHeight: 36,
              }}
            >
              <T variant="num" tone="ink70">{e}</T>
            </Tappable>
          ))}
        </View>
      )}
    </View>
  );
}
