/**
 * Tombol tambah yang ngambang di pojok kanan bawah.
 *
 * Ngambang, bukan nempel di daftar: dashboard sama kalender dua-duanya bisa
 * digulung panjang, dan tombol yang ikut kegulung ke atas layar itu tombol
 * yang ilang persis pas lagi dibutuhin.
 *
 * Posisinya diangkat di atas tab bar yang juga ngambang, lewat
 * `useTabBarSpace()` — angka yang sama yang dipakai layar-layar tab buat
 * nyisain ruang. Dulu di sini ada tebakan `TAB_BAR = 56` sendiri, dan tebakan
 * yang diketik dua kali itu cuma nunggu waktu buat beda.
 */
import { View } from "react-native";
import { useTheme } from "../theme";
import { useTabBarSpace } from "./FloatingTabBar";
import { Tappable } from "../ui/Pressable";
import { T } from "../ui/T";

export function FloatingAdd({ onPress }: { onPress: () => void }) {
  const th = useTheme();
  const tabSpace = useTabBarSpace();

  return (
    <View
      style={{
        position: "absolute",
        right: th.space[4],
        bottom: tabSpace + th.space[3],
      }}
      // Cuma tombolnya yang nangkep sentuhan; sisanya tembus ke daftar di
      // bawahnya, biar area kosong di sekitarnya tetap bisa digulung.
      pointerEvents="box-none"
    >
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Tambah task"
        style={{
          width: 56,
          height: 56,
          borderRadius: th.radius.full,
          backgroundColor: th.c.ink,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Plus-nya teks, bukan ikon: app ini belum punya set ikon sama
            sekali, dan naruh satu SVG cuma buat satu tombol bikin dua sistem
            hidup bareng. */}
        <T variant="h2" tone="surface" style={{ fontSize: 28, lineHeight: 32 }}>
          +
        </T>
      </Tappable>
    </View>
  );
}
