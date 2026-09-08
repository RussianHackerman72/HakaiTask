/**
 * Kolom teks.
 *
 * Beda dari primitif lain di folder ini: dia GAK punya padanan di CSS web,
 * soalnya web-nya emang belum pernah punya form — chat satu-satunya pintu
 * masuk di sana. Jadi bentuknya diturunin dari kolom-kolom yang udah kepakai
 * di app ini, bukan dari `styles.css`.
 *
 * Ada dua bentuk, dan dua-duanya udah ada di app cuma ditulis inline
 * berulang-ulang:
 *
 *   bare    tanpa latar, `padding: 0` — kebaca sebagai TEKS yang kebetulan
 *           bisa diedit. Dipakai buat judul & catatan di layar task, tempat
 *           kotak input malah bikin layarnya rame.
 *   filled  latar surface, sudut penuh — kebaca sebagai kolom isian. Dipakai
 *           buat pencarian dan form.
 *
 * `bare` yang jadi bawaan, bukan `filled`: kolom yang gak keliatan kayak
 * kolom itu pilihan sadar di app ini, dan bawaan mestinya yang paling sering
 * dipakai.
 */
import { forwardRef } from "react";
import { TextInput, type TextInputProps, type TextStyle } from "react-native";
import { useTheme } from "../theme";

export interface InputProps extends Omit<TextInputProps, "style"> {
  tone?: "bare" | "filled";
  /** Varian tipografi — samain sama teks di sekitarnya. */
  variant?: "body" | "bodySm" | "h2";
  style?: TextStyle;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { tone = "bare", variant = "bodySm", style, multiline, ...rest },
  ref,
) {
  const th = useTheme();
  const filled = tone === "filled";

  return (
    <TextInput
      ref={ref}
      multiline={multiline}
      // Tanpa ini teksnya jadi hitam di tema gelap — RN gak ikut warna tema.
      placeholderTextColor={th.c.ink40}
      // Kursornya juga: bawaan RN biru, sedangkan app ini gak punya biru.
      selectionColor={th.c.ink}
      style={[
        th.t[variant],
        { color: th.c.ink, padding: 0 },
        filled && {
          backgroundColor: th.c.surface,
          borderRadius: th.radius.full,
          paddingHorizontal: 18,
          // Diisi biar tingginya nyampe 44dp — batas sentuh yang sama kayak
          // `Tappable`. Kolom yang lebih pendek dari itu susah dikenain.
          paddingVertical: 12,
        },
        // `multiline` di Android rata atas cuma kalau dipaksa; tanpa ini
        // barisnya nempel di tengah dan lompat pas nambah baris kedua.
        multiline && { textAlignVertical: "top" as const },
        style,
      ]}
      {...rest}
    />
  );
});
