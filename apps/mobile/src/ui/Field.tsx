/**
 * Label + isian + satu baris keterangan.
 *
 * Keterangannya bukan hiasan. Form nambah task punya beberapa isian yang
 * hasilnya gak keliatan langsung — jadwal pengingat contohnya bisa jadi
 * puluhan notifikasi, dan angkanya cuma bisa diomongin di sini. Makanya
 * `hint` sama `error` nempel di primitifnya, bukan ditempel-tempel sendiri
 * tiap dipakai.
 *
 * `error` numpuk di atas `hint`, bukan nambah baris kedua: dua baris teks
 * kecil di bawah satu kolom bikin form-nya keliatan lebih rusak daripada
 * keadaannya.
 */
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { T } from "./T";

export function Field({
  label,
  hint,
  error,
  children,
  style,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const th = useTheme();
  const bawah = error ?? hint;

  return (
    <View style={[{ gap: 6 }, style]}>
      <T variant="meta" tone="ink70">
        {label}
      </T>
      {children}
      {bawah ? (
        <T variant="meta" tone={error ? "accent" : "ink40"}>
          {bawah}
        </T>
      ) : null}
    </View>
  );
}
