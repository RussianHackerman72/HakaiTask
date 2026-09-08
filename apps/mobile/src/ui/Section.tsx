/**
 * Judul kelompok + isinya.
 *
 * Diangkat apa adanya dari `app/task/[id].tsx`, tempat dia hidup sebagai
 * komponen lokal. Layar Setelan sama form nambah task butuh bentuk yang sama,
 * dan nyalin komponen tiga baris ke tiga berkas itu cara paling cepat bikin
 * tiga jarak yang beda-beda tipis.
 *
 * `fontSize: 15` di atas `h2` itu bawaan dari sananya — `h2` aslinya kegedean
 * buat judul kelompok, dan tiap pemakainya nurunin sendiri dengan angka yang
 * sama. Sekarang angkanya cuma ada di satu tempat.
 */
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { T } from "./T";

export function Section({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const th = useTheme();
  return (
    <View style={[{ marginTop: th.space[5] }, style]}>
      <T variant="h2" style={{ fontSize: 15, marginBottom: th.space[2] }}>
        {label}
      </T>
      {children}
    </View>
  );
}
