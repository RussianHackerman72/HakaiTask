/**
 * Baris setelan: judul + keterangan di kiri, kontrol di kanan.
 *
 * Bentuk ini udah ditulis ulang tiga kali dengan tangan — kartu izin di layar
 * penjaga fokus, checkbox DND, togel mode ketat — dan tiap kali beda tipis:
 * jarak beda, lebar teks beda, tinggi sentuh beda. Layar Setelan bakal punya
 * belasan baris begini, jadi bentuknya dipatok sekali di sini.
 *
 * `right` sengaja `ReactNode`, bukan pilihan tertutup kayak "switch | chevron":
 * yang nempel di kanan di app ini udah ada tiga jenis (Switch, teks status,
 * tanda panah), dan bikin enum-nya cuma mindahin percabangan ke sini.
 */
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Tappable } from "./Pressable";
import { T } from "./T";

export function Row({
  label,
  hint,
  right,
  onPress,
  style,
}: {
  label: string;
  hint?: string;
  right?: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const th = useTheme();

  const isi = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: th.space[3],
          // 44dp: batas sentuh yang sama kayak `Tappable`, dipatok walau
          // barisnya cuma satu baris teks pendek.
          minHeight: 44,
          paddingVertical: 6,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body">{label}</T>
        {hint ? (
          <T variant="meta" tone="ink40">
            {hint}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );

  // Baris tanpa `onPress` gak dibungkus Tappable: bungkusan yang bisa ditekan
  // tapi gak ngapa-ngapain itu bohong kecil yang kerasa pas dipencet.
  return onPress ? <Tappable onPress={onPress}>{isi}</Tappable> : isi;
}
